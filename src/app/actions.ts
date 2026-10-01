"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/auth";
import { expenseSchema, receiptExtension } from "@/lib/expenses";
export type ActionState = { error?: string; success?: string };
export async function login(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const email = z.email().safeParse(
    String(form.get("email") ?? "")
      .trim()
      .toLowerCase(),
  );
  if (!email.success) return { error: "הזינו כתובת אימייל תקינה." };
  const generic = {
    success:
      "אם כתובת האימייל שלכם אושרה, קישור כניסה מאובטח יישלח אליכם. בדקו גם בתיקיית הספאם.",
  };
  const admin = adminClient();
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = (identity: string) =>
    createHash("sha256").update(identity).digest("hex");
  const limits = await Promise.all([
    admin.rpc("consume_auth_rate_limit", {
      p_key: key(`email:${email.data}`),
      p_limit: 3,
      p_window_seconds: 900,
    }),
    admin.rpc("consume_auth_rate_limit", {
      p_key: key(`ip:${ip}`),
      p_limit: 10,
      p_window_seconds: 900,
    }),
  ]);
  if (limits.some((result) => result.error)) {
    console.error("Magic-link rate-limit check failed.");
    return { error: "שירות הכניסה לא זמין כרגע. נסו שוב בעוד כמה דקות." };
  }
  if (limits.some((result) => !result.data))
    return { error: "נשלחו יותר מדי בקשות כניסה. המתינו 15 דקות ונסו שוב." };
  const { data: approved, error: approvalError } = await admin
    .from("members")
    .select("email")
    .eq("email", email.data)
    .eq("active", true)
    .maybeSingle();
  if (approvalError) {
    console.error("Magic-link member lookup failed.");
    return { error: "לא ניתן לבדוק את הרשאת הכניסה כרגע. נסו שוב מאוחר יותר." };
  }
  if (!approved) return generic;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });
  if (error) {
    console.error("Magic-link send failed.", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    return {
      error:
        "לא הצלחנו לשלוח קישור כניסה. בדקו שההזמנה אושרה ונסו שוב; אם הבעיה נמשכת, פנו למנהל הפרויקט.",
    };
  }
  return generic;
}
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
export async function saveExpense(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, user, member } = await requireMember();
  if (member.role === "read_only")
    return { error: "למשתמשים עם הרשאת צפייה אין אפשרות לשנות הוצאות." };
  const parsed = expenseSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const expense = { ...parsed.data, amount: Number(parsed.data.amount) };
  const existingId = String(form.get("id") ?? "");
  if (existingId && !z.uuid().safeParse(existingId).success)
    return { error: "הוצאה לא תקינה." };
  const id = existingId || crypto.randomUUID();
  const files = form.getAll("receipts").filter((file): file is File => file instanceof File && file.size > 0);
  if (files.length > 10) return { error: "אפשר לצרף עד 10 קבצים להוצאה." };
  if (files.some((file) => file.size > 10 * 1024 * 1024))
    return { error: "כל קובץ חייב להיות בגודל של עד 10 MB." };
  if (files.reduce((total, file) => total + file.size, 0) > 10 * 1024 * 1024)
    return { error: "הגודל הכולל של הקבצים המצורפים מוגבל ל־10 MB." };
  const validatedFiles: { bytes: Uint8Array; extension: "pdf" | "jpg" | "png"; type: string }[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = receiptExtension(bytes, file.type);
    if (!extension) return { error: "אחד הקבצים אינו PDF, JPG או PNG תקין." };
    validatedFiles.push({ bytes, extension, type: file.type });
  }
  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("id", parsed.data.category_id)
    .single();
  if (!category) return { error: "בחרו קטגוריה תקינה." };
  if (existingId) {
    const { data } = await supabase
      .from("expenses")
      .select("created_by")
      .eq("id", id)
      .single();
    if (!data || (data.created_by !== user.id && member.role !== "admin"))
      return { error: "אין לכם הרשאה לערוך את ההוצאה." };
  }
  const uploaded: string[] = [];
  const attachments: { id: string; expense_id: string; path: string; created_by: string }[] = [];
  for (const { bytes, extension, type } of validatedFiles) {
    const attachmentId = crypto.randomUUID();
    const path = `${user.id}/${id}/${attachmentId}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(path, bytes, { contentType: type, upsert: false });
    if (uploadError) {
      console.error("Receipt upload failed.", uploadError.message);
      if (uploaded.length) await supabase.storage.from("receipts").remove(uploaded);
      return { error: "העלאת אחד הקבצים נכשלה. בדקו את החיבור ונסו שוב." };
    }
    uploaded.push(path);
    attachments.push({ id: attachmentId, expense_id: id, path, created_by: user.id });
  }
  if (!existingId) {
    const { error } = await supabase
      .from("expenses")
      .insert({ ...expense, id, created_by: user.id, receipt_path: null });
    if (error) {
      if (uploaded.length) await supabase.storage.from("receipts").remove(uploaded);
      return { error: "שמירת ההוצאה נכשלה. נסו שוב." };
    }
  }
  if (attachments.length) {
    const { error: linkError } = await supabase.from("expense_receipts").insert(attachments);
    if (linkError) {
      console.error("Receipt link failed.", linkError.message);
      await supabase.storage.from("receipts").remove(uploaded);
      if (!existingId) await supabase.from("expenses").delete().eq("id", id);
      return { error: "שמירת קובץ ההוצאה נכשלה. נסו שוב." };
    }
  }
  if (existingId) {
    const { error } = await supabase.from("expenses").update(expense).eq("id", id);
    if (error) {
      if (attachments.length)
        await supabase.from("expense_receipts").delete().in("id", attachments.map((attachment) => attachment.id));
      if (uploaded.length) await supabase.storage.from("receipts").remove(uploaded);
      return { error: "לא ניתן לעדכן את ההוצאה. נסו שוב." };
    }
  }
  revalidatePath("/");
  return { success: existingId ? "ההוצאה עודכנה." : "ההוצאה נוספה לפרויקט." };
}
export async function deleteExpense(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, user, member } = await requireMember();
  if (member.role === "read_only")
    return { error: "למשתמשים עם הרשאת צפייה אין אפשרות למחוק הוצאות." };
  const id = String(form.get("id"));
  if (!z.uuid().safeParse(id).success) return { error: "הוצאה לא תקינה." };
  const { data } = await supabase
    .from("expenses")
    .select("created_by,receipt_path")
    .eq("id", id)
    .single();
  if (!data || (data.created_by !== user.id && member.role !== "admin"))
    return { error: "אין לכם הרשאה למחוק את ההוצאה." };
  const { data: receipts } = await supabase
    .from("expense_receipts")
    .select("path")
    .eq("expense_id", id);
  // Remove the database row first: failed deletion must never lose a linked receipt.
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return { error: "לא ניתן למחוק את ההוצאה." };
  const paths = [...(receipts ?? []).map((receipt) => receipt.path), ...(data.receipt_path ? [data.receipt_path] : [])];
  if (paths.length) await supabase.storage.from("receipts").remove(paths);
  revalidatePath("/");
  return { success: "ההוצאה נמחקה." };
}
export async function inviteMember(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { member } = await requireMember();
  if (member.role !== "admin") return { error: "נדרשת הרשאת מנהל." };
  const email = z.email().safeParse(
    String(form.get("email") ?? "")
      .trim()
      .toLowerCase(),
  );
  if (!email.success) return { error: "הזינו כתובת אימייל תקינה." };
  const role = z
    .enum(["admin", "member", "read_only"])
    .safeParse(String(form.get("role") ?? "member"));
  if (!role.success) return { error: "בחרו סוג משתמש תקין." };
  const admin = adminClient();
  const { data: existing, error: lookupError } = await admin
    .from("members")
    .select("email, role, active")
    .eq("email", email.data)
    .maybeSingle();
  if (lookupError) return { error: "לא ניתן לבדוק את החברות בפרויקט." };
  if (email.data === member.email)
    return { error: "לא ניתן לשלוח הזמנה לעצמכם." };

  const { data: previous, error: saveError } = await admin
    .from("members")
    .upsert({ email: email.data, role: role.data, active: true }, { onConflict: "email" })
    .select("email")
    .single();
  if (saveError || !previous)
    return { error: "לא ניתן לאשר את כתובת האימייל." };

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`;
  let deliveryError: Error | null = null;
  const { data: users, error: usersError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (usersError) deliveryError = usersError;
  else {
    const authUser = users.users.find((user) => user.email?.toLowerCase() === email.data);
    if (authUser?.email_confirmed_at) {
      const supabase = await createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.data,
        options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
      });
      deliveryError = error;
    } else {
      const { error } = await admin.auth.admin.inviteUserByEmail(email.data, { redirectTo });
      deliveryError = error;
    }
  }

  if (deliveryError) {
    if (existing)
      await admin
        .from("members")
        .update({ role: existing.role, active: existing.active })
        .eq("email", email.data);
    else await admin.from("members").delete().eq("email", email.data);
    return {
      error:
        "שליחת ההזמנה נכשלה. ייתכן שהגעתם למגבלת השליחה החינמית. נסו מאוחר יותר.",
    };
  }
  revalidatePath("/");
  return {
    success: `נשלח קישור כניסה אל ${email.data} עם הרשאת ${role.data === "admin" ? "מנהל" : role.data === "read_only" ? "צפייה בלבד" : "עריכה"}.`,
  };
}
export async function toggleMember(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { member } = await requireMember();
  if (member.role !== "admin") return { error: "נדרשת הרשאת מנהל." };
  const email = String(form.get("email"));
  if (email === member.email)
    return { error: "לא ניתן לבטל את הגישה של עצמכם." };
  const { error } = await adminClient()
    .from("members")
    .update({ active: form.get("active") === "true" })
    .eq("email", email)
    .in("role", ["member", "read_only"]);
  if (error) return { error: "לא ניתן לשנות את הגישה." };
  revalidatePath("/");
  return { success: "הגישה עודכנה." };
}

export async function setMemberRole(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { member } = await requireMember();
  if (member.role !== "admin") return { error: "נדרשת הרשאת מנהל." };
  const email = z.email().safeParse(String(form.get("email") ?? "").toLowerCase());
  const role = z.enum(["admin", "member", "read_only"]).safeParse(String(form.get("role") ?? ""));
  if (!email.success || !role.success)
    return { error: "כתובת או סוג משתמש אינם תקינים." };
  if (email.data === member.email)
    return { error: "לא ניתן לשנות את ההרשאות של עצמכם." };
  const { data, error } = await adminClient()
    .from("members")
    .update({ role: role.data })
    .eq("email", email.data)
    .neq("email", member.email)
    .select("email")
    .maybeSingle();
  if (error || !data) return { error: "לא ניתן לעדכן את סוג המשתמש." };
  revalidatePath("/household");
  return { success: "סוג המשתמש עודכן." };
}

export async function saveCategory(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { member } = await requireMember();
  if (member.role !== "admin") return { error: "נדרשת הרשאת מנהל." };

  const parsed = z
    .object({
      id: z.union([z.uuid(), z.literal("")]),
      name: z.string().trim().min(1, "הזינו שם לקטגוריה.").max(60, "שם הקטגוריה ארוך מדי."),
      color: z.string().regex(/^#[\da-fA-F]{6}$/, "בחרו צבע תקין."),
    })
    .safeParse({
      id: String(form.get("id") ?? ""),
      name: String(form.get("name") ?? ""),
      color: String(form.get("color") ?? ""),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = adminClient();
  const { id, name, color } = parsed.data;
  const result = id
    ? await admin
        .from("categories")
        .update({ name, color })
        .eq("id", id)
        .select("id")
        .maybeSingle()
    : await admin.from("categories").insert({ name, color }).select("id").single();
  if (result.error) {
    if (result.error.code === "23505")
      return { error: "כבר קיימת קטגוריה בשם הזה." };
    return { error: "שמירת הקטגוריה נכשלה. נסו שוב." };
  }
  if (!result.data) return { error: "הקטגוריה לא נמצאה." };

  for (const path of ["/", "/categories", "/expenses", "/guide"]) {
    revalidatePath(path);
  }
  return { success: id ? "הקטגוריה עודכנה." : "הקטגוריה נוספה." };
}
