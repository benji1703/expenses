import { createClient } from "@/lib/supabase/server";
import { paymentStatuses, stages } from "@/lib/renovation-guide";
import type { Category, Expense } from "@/lib/expenses";
import JSZip from "jszip";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const filtersSchema = z.object({
  format: z.enum(["xlsx", "csv", "json"]).default("xlsx"),
  from: z.union([z.iso.date(), z.literal("")]).default(""),
  to: z.union([z.iso.date(), z.literal("")]).default(""),
  category: z.union([z.uuid(), z.literal("")]).default(""),
  status: z.union([z.enum(["paid", "unpaid", "planned"]), z.literal("")]).default(""),
  stage: z.union([z.enum(["rights", "planning", "permits", "construction", "finishing", "infrastructure"]), z.literal("")]).default(""),
  currency: z.union([z.enum(["ILS", "EUR", "USD", "GBP"]), z.literal("")]).default(""),
  q: z.string().trim().max(100).default(""),
});
type ExportExpense = Expense & { created_at: string; updated_at: string };

const columns = [
  ["id", "מזהה"],
  ["spent_on", "תאריך הוצאה"],
  ["due_on", "מועד לתשלום"],
  ["merchant", "ספק / רשות"],
  ["category", "קטגוריה"],
  ["amount", "סכום"],
  ["currency", "מטבע"],
  ["payment_status", "סטטוס תשלום"],
  ["stage", "שלב בפרויקט"],
  ["reference", "אסמכתה"],
  ["notes", "הערות"],
  ["receipt_attached", "צורפה אסמכתה"],
  ["created_at", "נוצר בתאריך"],
  ["updated_at", "עודכן בתאריך"],
] as const;

function xml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index: number) {
  let name = "";
  for (let number = index + 1; number; number = Math.floor((number - 1) / 26)) {
    name = String.fromCharCode(65 + ((number - 1) % 26)) + name;
  }
  return name;
}

function cellXml(reference: string, value: unknown, header = false) {
  const style = header ? ' s="1"' : "";
  if (typeof value === "number" && Number.isFinite(value))
    return `<c r="${reference}"${style}><v>${value}</v></c>`;
  if (typeof value === "boolean")
    return `<c r="${reference}"${style} t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function xlsxBuffer(rows: Record<string, unknown>[]) {
  const data = [
    columns.map(([, heading]) => heading),
    ...rows.map((row) => columns.map(([key]) => row[key])),
  ];
  const sheetRows = data
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) =>
          cellXml(`${columnName(columnIndex)}${rowIndex + 1}`, value, rowIndex === 0),
        )
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  const last = `${columnName(columns.length - 1)}${data.length}`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="הוצאות" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF362C24"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function csv(rows: Record<string, unknown>[]) {
  const values = [columns.map(([, heading]) => heading), ...rows.map((row) => columns.map(([key]) => row[key]))];
  return `\uFEFF${values.map((row) => row.map((value) => {
    const text = String(value ?? "");
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n")}`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return Response.json({ error: "נדרשת התחברות." }, { status: 401 });
  const { data: member } = await supabase
    .from("members")
    .select("email,active")
    .eq("email", user.email.toLowerCase())
    .eq("active", true)
    .maybeSingle();
  if (!member) return Response.json({ error: "אין גישה לפרויקט." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const parsed = filtersSchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) return Response.json({ error: "אחד ממסנני היצוא אינו תקין." }, { status: 400 });
  const filter = parsed.data;
  if (filter.from && filter.to && filter.from > filter.to)
    return Response.json({ error: "תאריך ההתחלה חייב להיות לפני תאריך הסיום." }, { status: 400 });

  let query = supabase.from("expenses").select("*").order("spent_on", { ascending: false }).order("created_at", { ascending: false });
  if (filter.from) query = query.gte("spent_on", filter.from);
  if (filter.to) query = query.lte("spent_on", filter.to);
  if (filter.category) query = query.eq("category_id", filter.category);
  if (filter.status) query = query.eq("payment_status", filter.status);
  if (filter.stage) query = query.eq("stage", filter.stage);
  if (filter.currency) query = query.eq("currency", filter.currency);
  if (filter.q) query = query.ilike("merchant", `%${filter.q.replace(/[%_\\]/g, "\\$&")}%`);

  const allExpenses: ExportExpense[] = [];
  for (let start = 0; start < 26000; start += 1000) {
    const { data, error } = await query.range(start, start + 999);
    if (error) return Response.json({ error: "לא ניתן לטעון את נתוני היצוא." }, { status: 500 });
    allExpenses.push(...(data as ExportExpense[]));
    if (allExpenses.length > 25000)
      return Response.json({ error: "היצוא מוגבל ל־25,000 הוצאות בכל פעם. צמצמו את טווח התאריכים או הוסיפו מסנן." }, { status: 413 });
    if (!data || data.length < 1000) break;
  }
  const { data: categories, error: categoryError } = await supabase.from("categories").select("id,name");
  if (categoryError) return Response.json({ error: "לא ניתן לטעון את הקטגוריות." }, { status: 500 });
  const names = new Map((categories as Pick<Category, "id" | "name">[]).map((category) => [category.id, category.name]));
  const rows = allExpenses.map((expense) => ({
    id: expense.id,
    spent_on: expense.spent_on,
    due_on: expense.due_on ?? "",
    merchant: expense.merchant,
    category_id: expense.category_id,
    category: names.get(expense.category_id) ?? "",
    amount: Number(expense.amount),
    currency: expense.currency,
    payment_status_code: expense.payment_status,
    payment_status: paymentStatuses[expense.payment_status as keyof typeof paymentStatuses] ?? expense.payment_status,
    stage_code: expense.stage,
    stage: stages[expense.stage as keyof typeof stages] ?? expense.stage,
    reference: expense.reference,
    notes: expense.notes,
    receipt_attached: Boolean(expense.receipt_path),
    created_at: expense.created_at,
    updated_at: expense.updated_at,
  }));
  const datePart = [filter.from || "all", filter.to || "dates"].join("_to_");
  const filename = `mishk-48-expenses-${datePart}.${filter.format}`;
  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename="expenses.${filter.format}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  };

  if (filter.format === "json")
    return new Response(JSON.stringify(rows, null, 2), { headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
  if (filter.format === "csv")
    return new Response(csv(rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  const buffer = await xlsxBuffer(rows);
  return new Response(new Uint8Array(buffer), {
    headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });
}
