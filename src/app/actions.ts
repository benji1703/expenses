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
  if (limits.some((result) => result.error || !result.data)) return generic;
  const { data: approved } = await admin
    .from("members")
    .select("email")
    .eq("email", email.data)
    .eq("active", true)
    .maybeSingle();
  if (!approved) return generic;
  const supabase = await createClient();
  await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });
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
  const parsed = expenseSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const expense = { ...parsed.data, amount: Number(parsed.data.amount) };
  const existingId = String(form.get("id") ?? "");
  if (existingId && !z.uuid().safeParse(existingId).success)
    return { error: "הוצאה לא תקינה." };
  const id = existingId || crypto.randomUUID();
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
    const { error } = await supabase
      .from("expenses")
      .update(expense)
      .eq("id", id);
    if (error) return { error: "לא ניתן לעדכן את ההוצאה. נסו שוב." };
  } else {
    const file = form.get("receipt");
    let path: string | null = null;
    if (file instanceof File && file.size) {
      if (file.size > 10 * 1024 * 1024)
        return { error: "המסמך חייב להיות בגודל של עד 10 MB." };
      const bytes = new Uint8Array(await file.arrayBuffer());
      const extension = receiptExtension(bytes, file.type);
      if (!extension) return { error: "בחרו מסמך PDF, JPG או PNG תקין." };
      path = `${user.id}/${id}.${extension}`;
      const { error } = await supabase.storage
        .from("receipts")
        .upload(path, bytes, { contentType: file.type, upsert: false });
      if (error) return { error: "העלאת המסמך נכשלה. נסו שוב." };
    }
    const { error } = await supabase
      .from("expenses")
      .insert({ ...expense, id, created_by: user.id, receipt_path: path });
    if (error) {
      if (path) await supabase.storage.from("receipts").remove([path]);
      return { error: "שמירת ההוצאה נכשלה. נסו שוב." };
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
  const id = String(form.get("id"));
  if (!z.uuid().safeParse(id).success) return { error: "הוצאה לא תקינה." };
  const { data } = await supabase
    .from("expenses")
    .select("created_by,receipt_path")
    .eq("id", id)
    .single();
  if (!data || (data.created_by !== user.id && member.role !== "admin"))
    return { error: "אין לכם הרשאה למחוק את ההוצאה." };
  // Remove the database row first: failed deletion must never lose a linked receipt.
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return { error: "לא ניתן למחוק את ההוצאה." };
  if (data.receipt_path)
    await supabase.storage.from("receipts").remove([data.receipt_path]);
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
  const admin = adminClient();
  const { data: existing } = await admin
    .from("members")
    .select("email")
    .eq("email", email.data)
    .maybeSingle();
  if (existing)
    return {
      error: "כתובת זו כבר נמצאת בפרויקט. אפשר לנהל את הגישה שלה ברשימה.",
    };
  const { error } = await admin.from("members").insert({ email: email.data });
  if (error) return { error: "לא ניתן לאשר את כתובת האימייל." };
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email.data,
    { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm` },
  );
  if (inviteError) {
    await admin.from("members").delete().eq("email", email.data);
    return {
      error:
        "שליחת ההזמנה נכשלה. ייתכן שהגעתם למגבלת השליחה החינמית. נסו מאוחר יותר.",
    };
  }
  revalidatePath("/");
  return { success: `הזמנה נשלחה אל ${email.data}.` };
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
    .eq("role", "member");
  if (error) return { error: "לא ניתן לשנות את הגישה." };
  revalidatePath("/");
  return { success: "הגישה עודכנה." };
}
