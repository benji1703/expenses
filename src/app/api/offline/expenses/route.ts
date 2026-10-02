import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { expenseSchema, receiptExtension } from "@/lib/expenses";
import { sameExpenseFields } from "@/lib/offline-types";

const payloadSchema = z.object({
  owner: z.uuid(), operation_id: z.uuid(), expense_id: z.uuid(), editing: z.boolean(),
  expected_updated_at: z.iso.datetime({ offset: true }).nullable(),
  fields: z.record(z.string(), z.string()),
  files: z.array(z.object({ id: z.uuid(), path: z.string().max(200), type: z.enum(["application/pdf", "image/jpeg", "image/png"]) })).max(10),
});
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
async function authorizeWriter() {
  // Revalidate identity and membership on every replay; cached access never authorizes a write.
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  const user = claims?.claims;
  if (authError || !user?.sub || typeof user.email !== "string") return fail("יש להתחבר מחדש כדי לסנכרן את הטיוטות.", 401);
  const { data: member, error: memberError } = await supabase.from("members").select("role").eq("email", user.email.toLowerCase()).eq("active", true).single();
  if (memberError && memberError.code !== "PGRST116") return fail("שירות ההרשאות אינו זמין. ננסה שוב.", 503);
  if (!member || member.role === "read_only") return fail("אין הרשאה לסנכרן שינויים. הטיוטות נשארו במכשיר.", 403);
  return { supabase, user, member };
}
export async function GET(request: Request) {
  const auth = await authorizeWriter();
  if (auth instanceof Response) return auth;
  const id = new URL(request.url).searchParams.get("expense_id");
  if (!id) {
    const categories = new URL(request.url).searchParams.has("categories")
      ? await auth.supabase.from("categories").select("*").order("name") : null;
    if (categories?.error) return fail("לא ניתן לטעון קטגוריות כרגע.", 503);
    return NextResponse.json({ profile: { id: auth.user.sub, role: auth.member.role }, ...(categories ? { categories: categories.data } : {}) }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!z.uuid().safeParse(id).success) return fail("מזהה ההוצאה אינו תקין.", 400);
  const { data: expense, error } = await auth.supabase.from("expenses").select("*").eq("id", id).maybeSingle();
  if (error) return fail("לא ניתן לטעון את ההוצאה כרגע.", 503);
  if (!expense) return fail("ההוצאה נמחקה. הטיוטה נשארה במכשיר.", 409);
  if (expense.created_by !== auth.user.sub && auth.member.role !== "admin") return fail("אין הרשאה לשנות את ההוצאה.", 403);
  return NextResponse.json({ expense }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return fail("מקור הבקשה אינו מאושר.", 403);
  const auth = await authorizeWriter();
  if (auth instanceof Response) return auth;
  const { supabase, user, member } = auth;
  const payload = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return fail("נתוני הסנכרון אינם תקינים.", 400);
  const draft = payload.data;
  if (draft.owner !== user.sub) return fail("התחברו לחשבון ששמר את הטיוטה כדי לסנכרן.", 403);
  const parsed = expenseSchema.safeParse(draft.fields);
  if (!parsed.success) return fail(parsed.error.issues[0].message, 400);
  if (!draft.editing && draft.operation_id !== draft.expense_id) return fail("מזהה ההוצאה אינו תקין.", 400);
  if (draft.editing && !draft.expected_updated_at) return fail("נדרשת גרסת ההוצאה המקורית לעריכה.", 409);
  const expense = { ...parsed.data, amount: Number(parsed.data.amount) };
  const { data: category } = await supabase.from("categories").select("id").eq("id", expense.category_id).maybeSingle();
  if (!category) return fail("הקטגוריה אינה זמינה. עדכנו את הטיוטה.", 400);
  const { data: existing, error: lookupError } = await supabase.from("expenses").select("*").eq("id", draft.expense_id).maybeSingle();
  if (lookupError) return fail("לא ניתן לבדוק את ההוצאה כרגע. ננסה שוב.", 503);
  if (existing && (draft.editing ? existing.created_by !== user.sub && member.role !== "admin" : existing.created_by !== user.sub)) return fail("אין הרשאה לשנות את ההוצאה.", 403);
  if (!existing && draft.editing) return fail("ההוצאה נמחקה בינתיים. הטיוטה נשמרה במכשיר.", 409);
  const alreadySaved = !!existing && sameExpenseFields(existing, expense);
  if (existing && !alreadySaved && (!draft.editing || existing.updated_at !== draft.expected_updated_at))
    return fail("ההוצאה שונתה במכשיר אחר. בדקו את השינויים לפני שמירה מחדש.", 409);

  const attachments: { id: string; expense_id: string; path: string; created_by: string }[] = [];
  let totalBytes = 0;
  // Files upload directly to Supabase to avoid Vercel's request-body limit.
  // Trusted validation still checks actual bytes, bounded size and the caller's folder.
  for (const file of draft.files) {
    const extension = file.type === "application/pdf" ? "pdf" : file.type === "image/jpeg" ? "jpg" : "png";
    if (file.path !== `${user.sub}/${draft.expense_id}/${file.id}.${extension}`) return fail("נתיב קובץ אינו תקין.", 400);
    const { data: linked } = await supabase.from("expense_receipts").select("id,path,expense_id").eq("id", file.id).maybeSingle();
    if (linked) {
      if (linked.path !== file.path || linked.expense_id !== draft.expense_id) return fail("הקובץ שייך להוצאה אחרת.", 409);
      continue;
    }
    const { data: blob, error } = await adminClient().storage.from("receipts").download(file.path);
    if (error || !blob) return fail("אחד הקבצים עדיין לא עלה. ננסה שוב.", 503);
    totalBytes += blob.size;
    if (blob.size > 10 * 1024 * 1024 || totalBytes > 10 * 1024 * 1024) return fail("הגודל הכולל של הקבצים מוגבל ל־10 MB.", 400);
    if (receiptExtension(new Uint8Array(await blob.arrayBuffer()), file.type) !== extension) return fail("קובץ מצורף אינו PDF, JPG או PNG תקין.", 400);
    attachments.push({ id: file.id, expense_id: draft.expense_id, path: file.path, created_by: user.sub });
  }
  if (!existing) {
    const { error } = await supabase.from("expenses").insert({ ...expense, id: draft.expense_id, created_by: user.sub, receipt_path: null });
    if (error && error.code !== "23505") return fail("שמירת ההוצאה נכשלה. ננסה שוב.", 503);
    if (error) {
      const { data: concurrent } = await supabase.from("expenses").select("*").eq("id", draft.expense_id).maybeSingle();
      if (!concurrent || concurrent.created_by !== user.sub || !sameExpenseFields(concurrent, expense)) return fail("קיימת הוצאה שונה עם אותו מזהה. הטיוטה נשמרה במכשיר.", 409);
    }
  } else if (!alreadySaved) {
    const { data: updated, error } = await supabase.from("expenses").update(expense).eq("id", draft.expense_id).eq("updated_at", draft.expected_updated_at!).select("id").maybeSingle();
    if (error) return fail("עדכון ההוצאה נכשל. ננסה שוב.", 503);
    if (!updated) return fail("ההוצאה השתנתה בזמן הסנכרון. בדקו את השינויים.", 409);
  }
  if (attachments.length) {
    const { error } = await supabase.from("expense_receipts").upsert(attachments, { onConflict: "id", ignoreDuplicates: true });
    // Keep the saved expense and immutable uploads. Replaying completes missing links safely.
    if (error) return fail("ההוצאה נשמרה, אך הקבצים טרם סונכרנו. ננסה שוב.", 503);
  }
  const { data: saved, error } = await supabase.from("expenses").select("*").eq("id", draft.expense_id).single();
  if (error || !saved) return fail("לא ניתן לאשר את הסנכרון כרגע. ננסה שוב.", 503);
  revalidatePath("/", "layout");
  return NextResponse.json({ expense: saved }, { headers: { "Cache-Control": "no-store" } });
}
