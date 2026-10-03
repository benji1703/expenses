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
  amount_source?: "total" | "currency";
  currency?: "ILS" | "USD" | "EUR" | "GBP";
  spent_on?: string;
  due_on?: string;
  reference?: string;
  category_id?: string;
  payment_status?: "paid" | "unpaid" | "planned";
  document_type?: keyof typeof documentTypes;
  notes?: string;
  amount_candidates: string[];
  amount_alternatives?: string[];
  merchant_candidates?: string[];
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
  if (/לתשלום\s*עד|מסלקה|ברקוד|^(?:[\d.()•*\s]+)?(?:יש\s|ניתן\s|לצורך\s|עליכם\s|הערה\s|הודעה\s)/i.test(line)) return 0;
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
      // Unlabelled currency values are suggestions for review, never automatic totals.
      for (const amount of values) candidates.push({ amount, score: 20, currency: currency(line) });
    }
  });
  const bestScore = Math.max(0, ...candidates.map((item) => item.score));
  const best = candidates.filter((item) => item.score === bestScore && (!finalLabel || item.score >= 80));
  const amounts = [...new Set(best.map((item) => item.amount))];
  const zero = amounts.includes("0.00");
  const selectedCurrency = best[0]?.currency ?? currency(lines.join("\n"));
  // Offer other labelled totals without weakening the automatic selection rules.
  // Unlabelled prices, tax bases and values in another currency are not corrections.
  const alternatives = zero || !best.length ? [] : [...new Set(candidates
    .filter((item) => item.amount !== "0.00" && item.score >= (bestScore >= 80 ? 80 : bestScore)
      && (!item.currency || !selectedCurrency || item.currency === selectedCurrency))
    .sort((a, b) => b.score - a.score).map((item) => item.amount))].slice(0, 6);
  const trusted = bestScore >= 80;
  return { amount: amounts.length === 1 && !zero && trusted ? amounts[0] : undefined,
    source: best.length ? trusted ? "total" as const : "currency" as const : undefined,
    currency: amounts.length === 1 && !zero ? best[0]?.currency : undefined, zero,
    candidates: amounts.length > 1 || !trusted ? amounts.filter((value) => value !== "0.00") : [], alternatives };
}

function documentType(text: string): ReceiptFields["document_type"] {
  // Only headers establish the document type, not a line promising a future receipt.
  const header = text.split("\n").slice(0, 14)
    .filter((line) => !/תופק|תונפק|תישלח|יופק|לאחר\s*התשלום|will\s*(?:be\s*)?(?:issued|sent)/i.test(line)).join("\n");
  if (/חשבונית\s*(?:מס\s*)?[/\-]?\s*קבלה|tax\s*invoice\s*[/\-]\s*receipt/i.test(header)) return "tax_receipt";
  if (/הצעת\s*מחיר|\bquotation\b|\bestimate\b|^אומדן(?:\s|$)/im.test(header)) return "quote";
  // A blank municipal payment coupon says "receipt for payer" before payment.
  if (/ארנונה/.test(text) && /מרכז\s*שירות\s*לתושב|מספר\s*רשות|חשבון\s*ארנונה/.test(header)
    && /(?:ה?סכום|סה\s*["']?\s*כ)\s*לתשלום/.test(text) && !/(?:סכום|סה\s*["']?\s*כ).*(?:שולם|התקבל)/.test(text)) return "payment_request";
  if (/דרישת\s*תשלום|חשבונ?ית\s*עסקה|חשבון\s*עסקה|\bpayment\s*request\b|\bpro\s*forma\b/i.test(header)) return "payment_request";
  if (/(?:^|\n)\s*(?:קבלה|receipt)(?:\s|[#:״"\-]|$)/i.test(header)) return "receipt";
  if (/חשבונית(?:\s*מס)?|\binvoice\b|\bfacture\b/i.test(header)) return "invoice";
  if (/חשבון\s*(?:חשמל|דו\s*חודשי)|\belectricity\s*bill\b/i.test(header)) return "payment_request";
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

function splitBusinessRegistration(line: string) {
  const label = '(?:עוסק\\s*(?:מורשה|פטור)|ח["\'.]?\\s*פ|ע["\'.]\\s*מ)';
  const match = line.match(new RegExp(`(${label})\\s*[:#.-]?\\s*(\\d{9})(?!\\d)|\\b(\\d{9})(?!\\d)\\s*[:#.-]?\\s*(${label})`));
  if (!match) return { text: line };
  return {
    text: line.replace(match[0], "").replace(/^[\s|:;-]+|[\s|:;-]+$/g, ""),
    registration: `${match[1] ?? match[4]} ${match[2] ?? match[3]}`,
  };
}

/** Only the issuer's business block belongs in notes, never customer details or line items. */
function businessHeader(lines: string[], merchant?: string) {
  if (!merchant) return;
  const compact = (value: string) => words(value.replace(/^(?:שם\s*(?:העסק|הספק)|ספק|מאת|merchant|supplier)\s*[:\-]\s*/i, "")).replace(/בעמ$/, "").replace(/\s/g, "");
  const matchesIssuer = (value: string) => {
    const name = compact(value), target = compact(merchant);
    return name === target || name.length >= 7 && Math.abs(name.length - target.length) <= 2 && editDistance(name, target) <= 2;
  };
  const header: ReturnType<typeof splitBusinessRegistration>[] = [];
  for (const line of lines.slice(0, 14)) {
    if (/(?:^|\s)(?:לכבוד|לקוח|שם\s*הלקוח|bill\s*to|customer)(?:\s|:|$)/i.test(line)) break;
    const row = splitBusinessRegistration(line);
    // A document title after the issuer block ends that block.
    if (header.some((item) => matchesIssuer(item.text))
      && /^(?:חשבונית|קבלה|דרישת\s*תשלום|הצעת\s*מחיר|invoice\b|receipt\b)/i.test(row.text)) break;
    header.push(row);
  }
  const registrations = [...new Set(header.flatMap((row) => row.registration ? [row.registration] : []))];
  if (registrations.length !== 1) return;
  const nameIndex = header.findIndex((row) => matchesIssuer(row.text));
  if (nameIndex < 0) return;
  const details: string[] = [];
  for (const { text } of header.slice(nameIndex + 1)) {
    if (!text) continue;
    const phone = text.match(/^(טלפון|טל\.?|נייד|פקס)\s*:?\s*([+\d][\d()\-\s]{5,24})$/);
    const reversedPhone = text.match(/^([+\d][\d()\-\s]{5,24})\s*:\s*(טלפון|טל\.?|נייד|פקס)$/);
    if (phone || reversedPhone) {
      details.push(phone ? `${phone[1]}: ${phone[2].trim()}` : `${reversedPhone![2]}: ${reversedPhone![1].trim()}`);
      continue;
    }
    if (identifiers.test(text) || totalScore(text) || nonTotal.test(text)) continue;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$|^(?:https?:\/\/|www\.)\S+$/i.test(text)) { details.push(text); continue; }
    if (/[א-ת]/.test(text) && /(?:^|\s)\d{1,5}(?=\s|,|$)/.test(text)
      && !currencyPattern.test(text) && !/תאריך|מספר|שעה|עמוד|חשבונית|קבלה|\d+[/.\-]\d+/i.test(text)) details.push(text);
  }
  const notes = [merchant, ...new Set(details), registrations[0]].join("\n");
  return notes.length <= 2000 ? notes : undefined;
}

function merchantName(lines: string[], known: string[]) {
  const explicit = /^(?:שם\s*(?:העסק|הספק)|ספק|מאת|merchant|supplier)\s*[:\-]\s*(.+)$/i;
  const excluded = /^(?:חשבונית|קבלה|דרישת\s*תשלום|הצעת\s*מחיר|חשבון(?:\s|דו|חשמל|עסקה)|עמוד|page\b|העתק|מקור|תאריך|לכבוד|לקוח|שם\s*הלקוח|כתובת|רחוב|טלפון|נייד|דוא["']?ל|מספר|תיאור|סה["']?כ|סכום|מע["']?מ|מס\s*ערך|מסמך|signature|date|receipt|invoice|electricity\s*bill|bill\s*to|customer|total)/i;
  const ranked: { name: string; score: number }[] = [];
  const alternatives: { name: string; score: number }[] = [];
  const fullText = lines.join("\n");
  const municipalSupplier = /(?:^|\n)לוגו\s+רעננה(?:\n|$)/.test(fullText)
    && /ארנונה/.test(fullText) && /מרכז\s*שירות\s*לתושב|מספר\s*רשות/.test(fullText) ? "עיריית רעננה" : undefined;
  if (municipalSupplier) return { merchant: municipalSupplier, candidates: [municipalSupplier] };
  const electricEvidence = /\biec\.co\.il\b|קוט["']?ש|חשבון\s*חשמל/i.test(fullText);
  for (let index = 0; index < Math.min(lines.length, 12); index++) {
    const line = splitBusinessRegistration(lines[index]).text;
    // PDF rows can join issuer details with the customer column's label.
    if (/(?:^|\s)(?:לכבוד|לקוח|שם\s*הלקוח|bill\s*to|customer)(?:\s|:|$)/i.test(line)) break;
    const labelled = line.match(explicit);
    const name = (labelled ? labelled[1].trim() : line).replace(/^(?:[|*•]\s*)+/, "");
    if (name.length < 3 || name.length > 160 || !/[א-תa-z]/i.test(name) || (!labelled && (excluded.test(name) || identifiers.test(name) || nonTotal.test(name) || totalScore(name) || currencyPattern.test(name) || /^\d/.test(name) || /[@]|https?:|www\.|\bsite\s*internet\b|\d{4,}/i.test(name)))) continue;
    let score = labelled ? 100 : 30 - index;
    const companyName = /בע["']?מ|\bltd\b|\binc\b/i.test(name);
    if (companyName) score += 20;
    const normalized = words(name);
    const compactName = normalized.replace(/בעמ$/, "").replace(/\s/g, "");
    const electricNames = ["חברתהחשמללישראל", "חברתחשמללישראל", "חברתהחשמל", "חברתחשמל"];
    if (electricNames.includes(compactName) || electricEvidence && electricNames.some((alias) => editDistance(compactName, alias) <= 1)) {
      const canonical = 'חברת החשמל לישראל בע"מ';
      ranked.push({ name: canonical, score: score + 50 });
      alternatives.push({ name: canonical, score: score + 50 }, { name, score });
      continue;
    }
    const match = known.find((item) => words(item) === normalized || words(item).replace(/\s/g, "") === normalized.replace(/\s/g, ""));
    if (match) { ranked.push({ name: match, score: score + 50 }); alternatives.push({ name: match, score: score + 50 }); continue; }
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
    // Only scanned supplier evidence and close matches are offered, never the
    // complete supplier directory or unlabelled address/description lines.
    if (labelled || companyName || fuzzy.length || similar.length) alternatives.push({ name, score });
    for (const candidate of new Set([...fuzzy, ...similar.map((item) => item.name)])) alternatives.push({ name: candidate, score: score + 35 });
    if (fuzzy.length === 1) ranked.push({ name: fuzzy[0], score: score + 35 });
    else if (similar.length === 1) ranked.push({ name: similar[0].name, score: score + 35 });
    else ranked.push({ name, score });
  }
  const logoOnlyElectricBill = /\biec\.co\.il\b/i.test(fullText) && /קוט["']?ש/i.test(fullText) && /מספר\s*(?:חשבון\s*)?חוזה/i.test(fullText);
  // Older electricity PDFs put the company name exclusively in a logo image.
  // Require the utility domain, electricity units and contract-account wording
  // together before filling a supplier absent from the readable header.
  const merchant = logoOnlyElectricBill && !alternatives.length ? 'חברת החשמל לישראל בע"מ' : ranked.sort((a, b) => b.score - a.score)[0]?.name;
  const candidates = new Map<string, string>();
  if (merchant) candidates.set(words(merchant).replace(/\s/g, ""), merchant);
  for (const { name } of alternatives.sort((a, b) => b.score - a.score)) {
    const key = words(name).replace(/\s/g, "");
    if (!candidates.has(key)) candidates.set(key, name);
  }
  return { merchant, candidates: [...candidates.values()].slice(0, 6) };
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
      // Municipal billing periods such as 07-08/26 are months, not dates.
      const separators = match[0].match(/[/.\-]/g);
      if (separators?.[0] !== separators?.[1]) continue;
      const year = match[1] ? +match[1] : +match[6] + (match[6].length === 2 ? 2000 : 0);
      const month = +(match[2] ?? match[5]);
      const day = +(match[3] ?? match[4]);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (year < 2000 || year > 2100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) continue;
      found.push({ date: date.toISOString().slice(0, 10), due, score: /תאריך\s*(?:עריכת|הפקת|הוצאה)|\bissue\s*date\b/i.test(label) ? 3 : /תאריך|\bdate\b/i.test(label) ? 2 : 1 });
    }
  }
  function select(due: boolean) {
    const dueDates = new Set(found.filter((item) => item.due).map((item) => item.date));
    const candidates = found.filter((item) => item.due === due && (due || item.score > 1 || !dueDates.has(item.date)));
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
  if (amount.candidates.length) warnings.push(amount.candidates.length > 1 ? "זוהו כמה סכומים אפשריים. בחרו את הסכום הנכון מהמסמך." : "לא זוהה סכום סופי. בדקו את הסכום המוצע לפי המסמך.");
  else if (amount.zero) warnings.push("המסמך מציג סכום אפס. אין סכום חיובי למילוי אוטומטי.");
  else if (!amount.amount) warnings.push("הסכום הסופי לא זוהה. מלאו אותו לפי המסמך.");
  if (type === "invoice") warnings.push("חשבונית אינה אישור תשלום. בדקו את סטטוס התשלום.");
  if (!type) warnings.push("סוג המסמך לא זוהה. בדקו את סטטוס התשלום.");
  const conditionalReceipt = /(?:משמש|תשמש|מהווה).*קבלה.*(?:רק\s*לאחר|לאחר\s*(?:הטבעת|תשלום))|קבלה.*(?:מותנית|לאחר\s*התשלום)/i.test(normalized);
  if (conditionalReceipt) warnings.push("המסמך משמש קבלה רק לאחר תשלום. בדקו אם שולם.");
  const { merchant, candidates: merchantCandidates } = merchantName(lines, context.merchants ?? []);
  if (!merchant) warnings.push("שם הספק לא זוהה. מלאו אותו לפי המסמך.");
  return {
    merchant, amount: amount.amount, amount_source: amount.source,
    notes: businessHeader(lines, merchant),
    currency: amount.currency ?? currency(normalized) ?? (merchant === "עיריית רעננה" ? "ILS" : undefined), ...dates(lines), reference,
    document_type: type,
    payment_status: conditionalReceipt && (type === "receipt" || type === "tax_receipt") ? "unpaid" : type === "receipt" || type === "tax_receipt" ? "paid" : type === "payment_request" ? "unpaid" : type === "quote" ? "planned" : undefined,
    category_id: matchCategory([merchant, normalized].filter(Boolean).join("\n"), context.categories ?? []),
    amount_candidates: amount.candidates, amount_alternatives: amount.alternatives,
    merchant_candidates: merchantCandidates, warnings,
    ...(amount.zero ? { zero_total: true } : {}),
  };
}

export type PdfTextItem = { str: string; dir: string; transform: number[]; width: number; height: number };

type TextBox = { text: string; x0: number; x1: number; y: number; height: number };
export type OcrLine = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; words?: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[] };

function textFamily(text: string) {
  if (/[א-ת]/.test(text) || /^["'״׳]+$/.test(text)) return "rtl";
  if (/^[\d.,/\-₪$€£]+$/.test(text)) return "number";
  return "ltr";
}

/** Glyphs are joined only when their physical boxes touch. Never remove spaces
 * from arbitrary OCR text: that would join unrelated amounts or identifiers. */
function rowWords(items: TextBox[]) {
  const unique = items.filter((item, index) => !items.some((other, otherIndex) => otherIndex !== index
    && other.text.length > item.text.length && other.text.includes(item.text)
    && Math.abs(other.y - item.y) <= Math.min(other.height, item.height) * 0.4
    && item.x0 >= other.x0 - 0.5 && item.x1 <= other.x1 + 0.5));
  const words: TextBox[] = [];
  for (const item of unique.sort((a, b) => a.x0 - b.x0)) {
    const previous = words.at(-1), family = textFamily(item.text);
    const gap = previous ? item.x0 - previous.x1 : Infinity;
    if (previous && family === textFamily(previous.text) && gap >= -0.5
      && gap <= Math.max(0.5, Math.min(previous.height, item.height) * 0.15)) {
      previous.text = family === "rtl" ? item.text + previous.text : previous.text + item.text;
      previous.x1 = item.x1;
    } else words.push({ ...item });
  }
  return words;
}

function positionedText(boxes: TextBox[]) {
  const rows: { y: number; height: number; items: TextBox[]; words: TextBox[] }[] = [];
  for (const box of [...boxes].sort((a, b) => a.y - b.y)) {
    if (!box.text.trim()) continue;
    const row = rows.find((candidate) => Math.abs(candidate.y - box.y) <= Math.max(2, Math.min(candidate.height, box.height) * 0.4));
    if (row) row.items.push(box);
    else rows.push({ y: box.y, height: box.height, items: [box], words: [] });
  }
  for (const row of rows) row.words = rowWords(row.items);
  const words = rows.flatMap((row) => row.words);
  const associations: string[] = [];
  for (const row of rows) {
    const phrases: TextBox[] = [];
    for (const word of [...row.words].sort((a, b) => b.x1 - a.x1)) {
      const previous = phrases.at(-1);
      if (previous && textFamily(previous.text) === "rtl" && textFamily(word.text) === "rtl"
        && previous.x0 - word.x1 >= -0.5 && previous.x0 - word.x1 <= Math.min(previous.height, word.height) * 1.5) {
        previous.text += " " + word.text; previous.x0 = word.x0;
      } else phrases.push({ ...word });
    }
    for (const label of phrases) {
      const amountLabel = totalScore(clean(label.text)) >= 80 && !nonTotal.test(clean(label.text))
        && !identifiers.test(label.text) && !/מסלקה|ברקוד|לתשלום\s*עד|מועד|תאריך/i.test(label.text)
        && !monetaryValues(label.text, true).length;
      const dateLabel = /^(?:תאריך\s*(?:עריכת|הפקת|הוצאה|החשבונ?ית|החשבון)|תאריך|לתשלום\s*עד|מועד\s*(?:ל?תשלום|פירעון))$/i.test(clean(label.text));
      if (!amountLabel && !dateLabel) continue;
      const candidates = words.flatMap((word) => {
        const gap = Math.abs(word.y - label.y), height = Math.max(word.height, label.height);
        if (word === label || gap < height * 0.5 || gap > height * 2.2) return [];
        const overlap = Math.min(word.x1, label.x1) - Math.max(word.x0, label.x0);
        if (overlap <= 0 || overlap / Math.min(word.x1 - word.x0, label.x1 - label.x0) < 0.4) return [];
        const value = clean(word.text);
        if (amountLabel ? !/^[\d\s.,₪$€£]+$/.test(value) || monetaryValues(value, true).length !== 1
          : !/^\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}$/.test(value)) return [];
        return [{ value, distance: gap / height }];
      }).sort((a, b) => a.distance - b.distance);
      const closest = candidates.filter((candidate) => candidate.distance <= (candidates[0]?.distance ?? 0) + 0.15);
      const values = [...new Set(closest.map((candidate) => candidate.value))];
      for (const value of values) associations.push(label.text + " " + value);
    }
  }
  return [...rows.map((row) => {
    const rtl = row.words.some((word) => textFamily(word.text) === "rtl");
    const values = [...row.words].sort((a, b) => rtl ? b.x1 - a.x1 : a.x0 - b.x0).map((word) => word.text);
    // Standalone numeric cells cannot inherit an unrelated label from the
    // previous row. Only the spatial associations below establish that link.
    return values.every((value) => /^[\d\s.,/\-₪$€£]+$|^(?:ILS|USD|EUR|GBP|ש["']?ח)$/i.test(value))
      ? "| " + values.join(" | ") + " |" : values.join(" ");
  }), ...new Set(associations)].join("\n");
}
/** OCR engines read columns independently. Rejoin aligned labels and values first. */
export function receiptOcrText(lines: OcrLine[]): string {
  return positionedText(lines.flatMap((line) => line.words?.length ? line.words : [line]).map(({ text, bbox }) => ({
    text: text.trim(), x0: bbox.x0, x1: bbox.x1, y: (bbox.y0 + bbox.y1) / 2, height: bbox.y1 - bbox.y0,
  })));
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
  return !!fields.zero_total || (!!fields.amount && fields.amount_source !== "currency" && !!fields.merchant && !!fields.document_type);
}

/** Reconstruct positioned PDF text without reversing Hebrew characters or decimal digits. */
export function receiptPdfText(items: PdfTextItem[]): string {
  return positionedText(items.map((item) => ({ text: item.str.trim(), x0: item.transform[4], x1: item.transform[4] + item.width, y: -item.transform[5], height: item.height })));
}
