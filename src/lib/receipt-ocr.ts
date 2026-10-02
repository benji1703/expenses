/** Conservative, local extraction: uncertain fields stay empty for human review. */
export const documentTypes = {
  receipt: "קבלה",
  tax_receipt: "חשבונית מס / קבלה",
  invoice: "חשבונית",
  payment_request: "דרישת תשלום / חשבון עסקה",
  quote: "הצעת מחיר / אומדן",
} as const;

export type ReceiptFields = {
  merchant?: string;
  amount?: string;
  currency?: "ILS" | "USD" | "EUR" | "GBP";
  spent_on?: string;
  due_on?: string;
  reference?: string;
  category_id?: string;
  payment_status?: "paid" | "unpaid" | "planned";
  document_type?: keyof typeof documentTypes;
  notes?: string;
  amount_candidates: string[];
  warnings: string[];
  zero_total?: boolean;
};
export type ReceiptContext = {
  categories?: { id: string; name: string }[];
  merchants?: string[];
};

function clean(text: string) {
  return text.normalize("NFKC").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[\u0591-\u05c7]/g, "").replace(/[״“”]/g, '"').replace(/[׳‘’]/g, "'")
    .replace(/([^\s])בע["']?מ(?=\s|$)/g, "$1 בע\"מ")
    .replace(/[^\S\n]+/g, " ").trim();
}
function words(text: string) {
  return clean(text).toLowerCase().replace(/["'.:,/\-]/g, "").replace(/\s+/g, " ").trim();
}

export function parseReceiptAmount(raw: string): string | undefined {
  let value = raw.replace(/\s/g, "");
  if (!/^\d+(?:[.,]\d+)*$/.test(value)) return;
  const separator = Math.max(value.lastIndexOf("."), value.lastIndexOf(","));
  if (separator >= 0) {
    const decimals = value.length - separator - 1;
    if (decimals === 1 || decimals === 2) {
      const integer = value.slice(0, separator);
      // Separators in the integer part must be thousands groups, never another decimal.
      if (/[.,]/.test(integer) && !/^\d{1,3}(?:[.,]\d{3})+$/.test(integer)) return;
      value = integer.replace(/[.,]/g, "") + "." + value.slice(separator + 1);
    } else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(value)) {
      value = value.replace(/[.,]/g, "");
    } else return;
  }
  const amount = Number(value);
  if (amount > 0 && amount <= 99_999_999.99) return amount.toFixed(2);
}

const currencyPattern = /₪|(?:^|[^א-ת])ש\s*["']?\s*ח(?=$|[^א-ת])|\b(?:ILS|NIS|USD|EUR|GBP)\b|[$€£]/i;
function currency(line: string): ReceiptFields["currency"] {
  if (/₪|(?:^|[^א-ת])ש\s*["']?\s*ח(?=$|[^א-ת])|\b(?:ILS|NIS)\b/i.test(line)) return "ILS";
  if (/\bUSD\b|\$/.test(line)) return "USD";
  if (/\bEUR\b|€/.test(line)) return "EUR";
  if (/\bGBP\b|£/.test(line)) return "GBP";
}
function totalScore(line: string) {
  if (/(?:ה?תשלום|שולם|התקבל).*בסך/i.test(line)) return 105;
  if (/(?:סה\s*["']?\s*כ|סך\s*(?:ה?כל|ה?כול)|סכום).*(?:התקבל|שולם)|(?:סכום\s*(?:שהתקבל|ששולם))|\bamount\s*paid\b/i.test(line)) return 110;
  if (/(?:סה\s*["']?\s*כ|סך\s*(?:ה?כל|ה?כול)|ה?סכום).*לתשלום|\bamount\s*due\b/i.test(line)) return 105;
  if (/somme.*payer.*ttc|total.*ttc|net.*payer/i.test(line)) return 105;
  if (/(?:סה\s*["']?\s*כ|סך\s*(?:ה?כל|ה?כול)|סכום).*(?:לתשלום|כולל\s*מע["']?מ)|סכום\s*סופי|\bgrand\s*total\b|\bamount\s*due\b/i.test(line)) return 100;
  if (/לתשלום|סה\s*["']?\s*כ|סך\s*(?:ה?כל|ה?כול)|\btotal\b/i.test(line)) return 90;
  if (/שולם\s*(?:במזומן|באשראי)|סכום\s*הקבלה/i.test(line)) return 80;
  return 0;
}
const nonTotal = /לפני\s*מע["']?מ|ללא\s*מע["']?מ|חייב\s*ב?מע["']?מ|סכום\s*ביניים|\bsub\s*total\b|הנחה|עודף|יתרה\s*קודמת|\bchange\b|\bdiscount\b|קוט["']?ש|kwh|(?:עמלה|סכומים\s*מעל)|\bHT\b|\bTVA\b/i;
const identifiers = /(?:(?:^|\s)(?:ח["']?פ|ע["']?מ)(?=\s|:|$)|עוסק\s*(?:מורשה|פטור)|מספר\s*(?:עסק|מסמך|חשבונית|קבלה|כרטיס)|טלפון|טל[.:]|פקס|ת["']?ז|\b(?:phone|vat\s*id|tax\s*id)\b)/i;

function monetaryValues(line: string, allowZero = false): string[] {
  const result: string[] = [];
  const pattern = /\d{1,3}(?:[ ,.]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;
  for (const match of line.matchAll(pattern)) {
    const start = match.index!;
    const before = line.slice(Math.max(0, start - 1), start);
    const after = line.slice(start + match[0].length);
    if (/[\d/.,\-]/.test(before) || /^[\d/.,\-]|^\s*%/.test(after)) continue;
    // A trailing OCR glyph can turn 361.95 into 361.950. A lone dot followed
    // by three digits is ambiguous; never silently turn it into 361,950.
    if (/^\d{1,3}\.\d{3}$/.test(match[0])) continue;
    const amount = allowZero && /^0+(?:[.,]0{1,2})?$/.test(match[0]) ? "0.00" : parseReceiptAmount(match[0]);
    if (amount) result.push(amount);
  }
  return result;
}

function findAmount(lines: string[]) {
  const candidates: { amount: string; score: number; currency?: ReceiptFields["currency"] }[] = [];
  let finalLabel = false;
  lines.forEach((line, index) => {
    if (nonTotal.test(line) || identifiers.test(line)) return;
    const score = totalScore(line);
    if (score >= 100) finalLabel = true;
    if (!score && /מע["']?מ|\bvat\b|מס\s*ערך\s*מוסף/i.test(line)) return;
    let values = monetaryValues(line, !!score);
    let source = line;
    if (score && !values.length) {
      // A total label and its value are often printed on separate lines.
      source = lines[index + 1] ?? "";
      if (/^[\d\s.,₪$€£"'שחA-Z]+$/i.test(source)) values = monetaryValues(source, true);
    }
    if (score) {
      for (const amount of values) candidates.push({ amount, score, currency: currency(line + " " + source) });
    } else if (currencyPattern.test(line)) {
      // Unlabelled currency values are usable only when there is a single distinct value.
      for (const amount of values) candidates.push({ amount, score: 20, currency: currency(line) });
    }
  });
  const bestScore = Math.max(0, ...candidates.map((item) => item.score));
  const best = candidates.filter((item) => item.score === bestScore && (!finalLabel || item.score >= 80));
  const amounts = [...new Set(best.map((item) => item.amount))];
  const zero = amounts.includes("0.00");
  return { amount: amounts.length === 1 && !zero ? amounts[0] : undefined, currency: amounts.length === 1 && !zero ? best[0]?.currency : undefined, zero, candidates: amounts.length > 1 ? amounts.filter((value) => value !== "0.00") : [] };
}

function documentType(text: string): ReceiptFields["document_type"] {
  // Only headers establish the document type, not a line promising a future receipt.
  const header = text.split("\n").slice(0, 14)
    .filter((line) => !/תופק|תונפק|תישלח|יופק|לאחר\s*התשלום|will\s*(?:be\s*)?(?:issued|sent)/i.test(line)).join("\n");
  if (/חשבונית\s*(?:מס\s*)?[/\-]?\s*קבלה|tax\s*invoice\s*[/\-]\s*receipt/i.test(header)) return "tax_receipt";
  if (/הצעת\s*מחיר|\bquotation\b|\bestimate\b|^אומדן(?:\s|$)/im.test(header)) return "quote";
  if (/דרישת\s*תשלום|חשבונ?ית\s*עסקה|חשבון\s*עסקה|\bpayment\s*request\b|\bpro\s*forma\b/i.test(header)) return "payment_request";
  if (/(?:^|\n)\s*(?:קבלה|receipt)(?:\s|[#:״"\-]|$)/i.test(header)) return "receipt";
  if (/חשבונית(?:\s*מס)?|\binvoice\b|\bfacture\b/i.test(header)) return "invoice";
}

function editDistance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) next.push(Math.min(next[j] + 1, previous[j + 1] + 1, previous[j] + (a[i] === b[j] ? 0 : 1)));
    previous = next;
  }
  return previous[b.length];
}
function merchantName(lines: string[], known: string[]) {
  const explicit = /^(?:שם\s*(?:העסק|הספק)|ספק|מאת|merchant|supplier)\s*[:\-]\s*(.+)$/i;
  const excluded = /^(?:חשבונית|קבלה|דרישת\s*תשלום|הצעת\s*מחיר|חשבון\s*עסקה|העתק|מקור|תאריך|לכבוד|לקוח|שם\s*הלקוח|כתובת|רחוב|טלפון|נייד|דוא["']?ל|מספר|תיאור|סה["']?כ|סכום|מע["']?מ|מס\s*ערך|מסמך|signature|date|receipt|invoice|bill\s*to|customer|total)/i;
  const ranked: { name: string; score: number }[] = [];
  for (let index = 0; index < Math.min(lines.length, 12); index++) {
    const line = lines[index];
    if (/^(?:לכבוד|לקוח|שם\s*הלקוח|bill\s*to|customer)(?:\s|:|$)/i.test(line)) break;
    const labelled = line.match(explicit);
    const name = labelled ? labelled[1].trim() : line;
    if (name.length < 3 || name.length > 160 || !/[א-תa-z]/i.test(name) || (!labelled && (excluded.test(name) || identifiers.test(name) || nonTotal.test(name) || totalScore(name) || currencyPattern.test(name) || /^\d/.test(name) || /[@]|https?:|www\.|\bsite\s*internet\b|\d{4,}/i.test(name)))) continue;
    let score = labelled ? 100 : 30 - index;
    if (/בע["']?מ|\bltd\b|\binc\b/i.test(name)) score += 20;
    const normalized = words(name);
    const match = known.find((item) => words(item) === normalized || words(item).replace(/\s/g, "") === normalized.replace(/\s/g, ""));
    if (match) { ranked.push({ name: match, score: score + 50 }); continue; }
    const tokens = normalized.split(" ").filter((token) => token.length > 1 && token !== "בעמ");
    const similar = known.map((item) => {
      const other = words(item).split(" ").filter((token) => token.length > 1 && token !== "בעמ");
      const shared = tokens.filter((token) => other.includes(token)).length;
      return { name: item, score: 2 * shared / Math.max(1, tokens.length + other.length), shared };
    }).filter((item) => item.score >= 0.8 && (item.shared >= 2 || normalized === words(item.name)));
    const compact = normalized.replace(/בעמ$/, "").replace(/\s/g, "");
    const fuzzy = compact.length >= 7 ? known.filter((item) => {
      const target = words(item).replace(/בעמ$/, "").replace(/\s/g, "");
      const limit = Math.min(2, Math.floor(Math.max(compact.length, target.length) * 0.15));
      return Math.abs(compact.length - target.length) <= limit && editDistance(compact, target) <= limit;
    }) : [];
    if (fuzzy.length === 1) ranked.push({ name: fuzzy[0], score: score + 35 });
    else if (similar.length === 1) ranked.push({ name: similar[0].name, score: score + 35 });
    else ranked.push({ name, score });
  }
  return ranked.sort((a, b) => b.score - a.score)[0]?.name;
}

const specificCategoryGroups = [
  { names: /דמי\s*היתר/i, evidence: /דמי\s*היתר/i },
  { names: /היוון|רכישת\s*זכויות/i, evidence: /דמי\s*היוון|רכישת\s*זכויות/i },
  { names: /חכירה|הסדרת\s*שימושים/i, evidence: /דמי\s*חכירה|הסדרת\s*שימושים/i },
  { names: /היטל\s*השבחה/i, evidence: /היטל\s*השבחה/i },
  { names: /מדידה|שמאות/i, evidence: /מודד|מדידה|שמאי|שמאות/i },
  { names: /משפטי/i, evidence: /עורך\s*דין|עורכת\s*דין|ייעוץ\s*משפטי|עו["']?ד/i },
  { names: /פיקוח|ניהול/i, evidence: /פיקוח\s*בניה|מפקח\s*בניה|ניהול\s*פרויקט/i },
];
const categoryGroups = [
  { names: /חשמל|תאורה|electric/i, evidence: /חשמל|חשמלאי|תאורה|לוח\s*חשמל|electric/i },
  { names: /אינסטלציה|צנרת|plumb/i, evidence: /אינסטלציה|אינסטלטור|צנרת|ביוב|plumb/i },
  { names: /אדריכל|תכנון|architect/i, evidence: /אדריכל|אדריכלות|תכנון\s*אדריכלי|architect/i },
  { names: /רמ["']?י|מקרקעי|זכויות/i, evidence: /רמ["']?י|רשות\s*מקרקעי\s*ישראל|דמי\s*היוון|דמי\s*היתר/i },
  { names: /רישוי|היתר|אגרות/i, evidence: /אגרת\s*בניה|היתר\s*בניה|ועדה\s*מקומית|היטל\s*השבחה/i },
  { names: /שלד|בטון|construction/i, evidence: /עבודות\s*שלד|יציקת\s*בטון|ברזל\s*לבניין|construction/i },
  { names: /ריצוף|קרמיקה|tile/i, evidence: /ריצוף|קרמיקה|אריחים|tile/i },
  { names: /נגרות|מטבח|kitchen/i, evidence: /נגרות|מטבח|ארונות|kitchen/i },
  { names: /אלומיניום|חלונות/i, evidence: /אלומיניום|חלונות|תריסים/i },
  { names: /מיזוג|air\s*condition/i, evidence: /מיזוג|מזגן|מזגנים|air\s*condition/i },
] as const;
function matchCategory(text: string, categories: NonNullable<ReceiptContext["categories"]>) {
  const normalized = words(text);
  const candidates = categories.map((category) => {
    const name = words(category.name);
    const exact = name.length >= 3 && (" " + normalized + " ").includes(" " + name + " ");
    const related = categoryGroups.some((group) => group.names.test(clean(category.name)) && group.evidence.test(text));
    const specific = specificCategoryGroups.some((group) => group.names.test(clean(category.name)) && group.evidence.test(text));
    return { id: category.id, score: specific ? 3 : exact ? 2 : related ? 1 : 0 };
  });
  const max = Math.max(0, ...candidates.map((item) => item.score));
  const best = candidates.filter((item) => item.score === max && item.score > 0);
  return best.length === 1 ? best[0].id : undefined;
}

function dates(lines: string[]) {
  const found: { date: string; due: boolean; score: number }[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const previous = [...lines.slice(Math.max(0, index - 2), index)].reverse().find((item) => /תאריך|\bdue\b|(?:לתשלום|לשלם|חשבון).*עד/i.test(item)) ?? "";
    const label = /תאריך|\bdue\b|(?:לתשלום|לשלם|חשבון).*עד/i.test(previous) ? previous + " " + line : line;
    const due = /מועד\s*(?:ל?תשלום|פירעון)|(?:לתשלום|לשלם|חשבון).*עד|תאריך\s*(?:פירעון|לתשלום)|\bdue\b/i.test(label);
    for (const match of line.matchAll(/\b(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})\b|\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/g)) {
      const year = match[1] ? +match[1] : +match[6] + (match[6].length === 2 ? 2000 : 0);
      const month = +(match[2] ?? match[5]);
      const day = +(match[3] ?? match[4]);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (year < 2000 || year > 2100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) continue;
      found.push({ date: date.toISOString().slice(0, 10), due, score: /תאריך\s*(?:עריכת|הפקת|הוצאה)|\bissue\s*date\b/i.test(label) ? 3 : /תאריך|\bdate\b/i.test(label) ? 2 : 1 });
    }
  }
  function select(due: boolean) {
    const candidates = found.filter((item) => item.due === due);
    const best = Math.max(0, ...candidates.map((item) => item.score));
    const values = [...new Set(candidates.filter((item) => item.score === best).map((item) => item.date))];
    return values.length === 1 ? values[0] : undefined;
  }
  return { spent_on: select(false), due_on: select(true) };
}

export function extractReceiptFields(text: string, context: ReceiptContext = {}): ReceiptFields {
  const lines = clean(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const normalized = lines.join("\n");
  const amount = findAmount(lines);
  const type = documentType(normalized);
  const labelledReference = normalized.match(/(?:מספר\s*(?:חשבונית|קבלה|מסמך|שובר)|(?:חשבונית(?:\s*מס)?(?:\s*[/\-]\s*קבלה)?|קבלה)\s*(?:מס["']?\s*\.?|מספר|#)|\b(?:invoice|receipt)\s*(?:no\.?|number|#))[^\S\n]*[:\-]?[^\S\n]*([\d][\dA-Z/\-]{0,39})/i)?.[1];
  // OCR frequently turns מס׳ into Latin letters; only fall back on a document heading.
  const headerReferences = lines.filter((line) => /^(?:חשבונית|קבלה|invoice|receipt)(?:\s|$)/i.test(line) && !currencyPattern.test(line))
    .flatMap((line) => [...line.matchAll(/(?:^|[^\d/.\-])(\d{3,20}(?:-\d{3,20})?)(?![\d/.\-])/g)].map((match) => match[1]));
  const uniqueReferences = [...new Set(headerReferences)];
  const reference = labelledReference ?? (uniqueReferences.length === 1 ? uniqueReferences[0] : undefined);
  const warnings: string[] = [];
  if (amount.candidates.length) warnings.push("זוהו כמה סכומים אפשריים. בחרו את הסכום הנכון מהמסמך.");
  else if (amount.zero) warnings.push("המסמך מציג סכום אפס. אין סכום חיובי למילוי אוטומטי.");
  else if (!amount.amount) warnings.push("הסכום הסופי לא זוהה. מלאו אותו לפי המסמך.");
  if (type === "invoice") warnings.push("חשבונית אינה אישור תשלום. בדקו את סטטוס התשלום.");
  if (!type) warnings.push("סוג המסמך לא זוהה. בדקו את סטטוס התשלום.");
  const conditionalReceipt = /(?:משמש|תשמש|מהווה).*קבלה.*(?:רק\s*לאחר|לאחר\s*(?:הטבעת|תשלום))|קבלה.*(?:מותנית|לאחר\s*התשלום)/i.test(normalized);
  if (conditionalReceipt) warnings.push("המסמך משמש קבלה רק לאחר תשלום. בדקו אם שולם.");
  const merchant = merchantName(lines, context.merchants ?? []);
  if (!merchant) warnings.push("שם הספק לא זוהה. מלאו אותו לפי המסמך.");
  return {
    merchant, amount: amount.amount,
    currency: amount.currency ?? currency(normalized), ...dates(lines), reference,
    document_type: type,
    payment_status: conditionalReceipt && (type === "receipt" || type === "tax_receipt") ? "unpaid" : type === "receipt" || type === "tax_receipt" ? "paid" : type === "payment_request" ? "unpaid" : type === "quote" ? "planned" : undefined,
    category_id: matchCategory(normalized, context.categories ?? []),
    amount_candidates: amount.candidates, warnings,
    ...(amount.zero ? { zero_total: true } : {}),
  };
}

export type PdfTextItem = { str: string; dir: string; transform: number[]; width: number; height: number };

export type OcrLine = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } };
/** OCR engines read columns independently. Rejoin aligned labels and values first. */
export function receiptOcrText(lines: OcrLine[]): string {
  const rows: { center: number; height: number; lines: OcrLine[] }[] = [];
  for (const line of [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0)) {
    if (!line.text.trim()) continue;
    const center = (line.bbox.y0 + line.bbox.y1) / 2;
    const height = line.bbox.y1 - line.bbox.y0;
    const row = rows.find((candidate) => Math.abs(candidate.center - center) <= Math.max(3, Math.min(candidate.height, height) * 0.5));
    if (row) row.lines.push(line);
    else rows.push({ center, height, lines: [line] });
  }
  return rows.map((row) => {
    const rtl = row.lines.some((line) => /[א-ת]/.test(line.text));
    return row.lines.sort((a, b) => rtl ? b.bbox.x1 - a.bbox.x1 : a.bbox.x0 - b.bbox.x0)
      .map((line) => line.text.trim()).join(" ");
  }).join("\n");
}

export function receiptImageSize(width: number, height: number) {
  const scale = Math.min(3, Math.max(1, 1800 / width), Math.sqrt(6_000_000 / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function receiptFieldQuality(fields: ReceiptFields) {
  return (fields.amount ? 4 : 0) + (fields.merchant ? 2 : 0) + (fields.document_type ? 1 : 0) + (fields.spent_on ? 1 : 0);
}

/** Skip line items and later pages once the expense's primary fields are present. */
export function receiptFieldsComplete(fields: ReceiptFields) {
  return !!fields.zero_total || (!!fields.amount && !!fields.merchant && !!fields.document_type);
}

/** Reconstruct positioned PDF text without reversing Hebrew characters or decimal digits. */
export function receiptPdfText(items: PdfTextItem[]): string {
  const rows: { y: number; height: number; items: PdfTextItem[] }[] = [];
  for (const item of [...items].sort((a, b) => b.transform[5] - a.transform[5])) {
    if (!item.str.trim()) continue;
    const row = rows.find((row) => Math.abs(row.y - item.transform[5]) <= Math.max(2, Math.min(row.height, item.height) * 0.4));
    if (row) row.items.push(item);
    else rows.push({ y: item.transform[5], height: item.height, items: [item] });
  }
  return rows.map((row) => {
    const rtl = row.items.some((item) => item.dir === "rtl" || /[א-ת]/.test(item.str));
    return row.items.sort((a, b) => rtl ? (b.transform[4] + b.width) - (a.transform[4] + a.width) : a.transform[4] - b.transform[4]).map((item) => item.str).join(" ");
  }).join("\n");
}
