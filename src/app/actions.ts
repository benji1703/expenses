"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/auth";
import { authStatusFor } from "@/lib/access-server";

export type ActionState = { error?: string; success?: string; category?: { id: string; name: string; color: string } };
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
async function deliverAccessLink(email: string) {
  const auth = (await authStatusFor([email])).get(email);
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`;
  if (auth?.email_confirmed_at) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({ email,
      options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
    });
    if (error) throw error;
  } else {
    const { error } = await adminClient().auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error) throw error;
  }
}

export async function inviteMember(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { member } = await requireMember();
  if (member.role !== "admin") return { error: "נדרשת הרשאת מנהל." };
  const email = z.email().safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  const role = z.enum(["admin", "member", "read_only"]).safeParse(String(form.get("role") ?? "member"));
  if (!email.success || !role.success) return { error: "הזינו כתובת אימייל והרשאה תקינות." };
  if (email.data === member.email) return { error: "לא ניתן לשלוח הזמנה לעצמכם." };
  const admin = adminClient();
  const { data: existing, error: lookupError } = await admin.from("members").select("email").eq("email", email.data).maybeSingle();
  if (lookupError) return { error: "לא ניתן לבדוק את החברות בפרויקט." };
  if (existing) return { error: "המשתמש כבר ברשימה. השתמשו בעריכה או בשליחה מחדש." };
  const { data: saved, error } = await admin.from("members").insert({ email: email.data, role: role.data, active: true }).select("created_at").single();
  if (error || !saved) return { error: "לא ניתן להוסיף את המשתמש. רעננו את הרשימה ונסו שוב." };
  try { await deliverAccessLink(email.data); }
  catch {
    // Remove only this unchanged invitation, never another admin's later edit.
    await admin.from("members").delete().eq("email", email.data).eq("role", role.data).eq("active", true).eq("created_at", saved.created_at);
    revalidatePath("/household");
    return { error: "שליחת ההזמנה נכשלה. נסו שוב מאוחר יותר." };
  }
  revalidatePath("/household");
  return { success: `הזמנה נשלחה אל ${email.data}.` };
}

export async function resendMemberInvitation(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { member } = await requireMember();
  if (member.role !== "admin") return { error: "נדרשת הרשאת מנהל." };
  const email = z.email().safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { error: "כתובת האימייל אינה תקינה." };
  if (email.data === member.email) return { error: "לא ניתן לשלוח הזמנה לעצמכם." };
  const { data, error } = await adminClient().from("members").select("email, active").eq("email", email.data).maybeSingle();
  if (error || !data) return { error: "המשתמש לא נמצא." };
  if (!data.active) return { error: "יש להחזיר את הגישה לפני שליחת הזמנה." };
  try { await deliverAccessLink(email.data); }
  catch { return { error: "שליחת הקישור נכשלה. נסו שוב מאוחר יותר." }; }
  revalidatePath("/household");
  return { success: "קישור כניסה נשלח מחדש." };
}

export async function updateMemberAccess(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { member } = await requireMember();
  if (member.role !== "admin") return { error: "נדרשת הרשאת מנהל." };
  const email = z.email().safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  const role = z.enum(["admin", "member", "read_only"]).safeParse(String(form.get("role") ?? ""));
  const active = z.enum(["true", "false"]).safeParse(String(form.get("active") ?? ""));
  if (!email.success || !role.success || !active.success) return { error: "פרטי ההרשאה אינם תקינים." };
  if (email.data === member.email) return { error: "לא ניתן לשנות את ההרשאות של עצמכם." };
  const { data, error } = await adminClient().from("members")
    .update({ role: role.data, active: active.data === "true" })
    .eq("email", email.data).neq("email", member.email).select("email").maybeSingle();
  if (error?.code === "23514" && error.message.includes("At least one active administrator"))
    return { error: "יש להשאיר לפחות מנהל פעיל אחד." };
  if (error || !data) return { error: "לא ניתן לעדכן את המשתמש." };
  revalidatePath("/", "layout");
  return { success: "ההרשאות עודכנו." };
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
        .select("id,name,color")
        .maybeSingle()
    : await admin.from("categories").insert({ name, color }).select("id,name,color").single();
  if (result.error) {
    if (result.error.code === "23505")
      return { error: "כבר קיימת קטגוריה בשם הזה." };
    return { error: "שמירת הקטגוריה נכשלה. נסו שוב." };
  }
  if (!result.data) return { error: "הקטגוריה לא נמצאה." };

  for (const path of ["/", "/categories", "/expenses", "/guide"]) {
    revalidatePath(path);
  }
  return { success: id ? "הקטגוריה עודכנה." : "הקטגוריה נוספה.", category: result.data };
}
