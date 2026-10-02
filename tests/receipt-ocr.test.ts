import assert from "node:assert/strict";
import test from "node:test";
import { extractReceiptFields, parseReceiptAmount, receiptPdfText } from "../src/lib/receipt-ocr.ts";

const categories = [
  { id: "electrical", name: "חשמל ותאורה" },
  { id: "planning", name: "אדריכלות ותכנון" },
  { id: "plumbing", name: "אינסטלציה" },
];

test("Hebrew tax receipt: supplier, final total, type and category", () => {
  const fields = extractReceiptFields(`אור חשמל בע״מ
עוסק מורשה: 512345678
חשבונית מס / קבלה מס׳ 004821
תאריך: 02/10/2026
לכבוד: משק 48
התקנת לוח חשמל ותאורה
סה״כ לפני מע״מ 1,000.00
מע״מ 18% 180.00
סה״כ לתשלום ₪ 1,180.00`, { categories });
  assert.equal(fields.merchant, 'אור חשמל בע"מ');
  assert.equal(fields.amount, "1180.00");
  assert.equal(fields.currency, "ILS");
  assert.equal(fields.document_type, "tax_receipt");
  assert.equal(fields.payment_status, "paid");
  assert.equal(fields.spent_on, "2026-10-02");
  assert.equal(fields.reference, "004821");
  assert.equal(fields.category_id, "electrical");
});

test("amount before Hebrew label, thousands and comma decimal", () => {
  const fields = extractReceiptFields(`קבלה
אבי אינסטלציה בע״מ
2.360,50 ש״ח סך הכל התקבל
עודף ₪ 39.50`, { categories });
  assert.equal(fields.amount, "2360.50");
  assert.equal(fields.merchant, 'אבי אינסטלציה בע"מ');
  assert.equal(fields.payment_status, "paid");
  assert.equal(fields.category_id, "plumbing");
});

test("separate-line total and receipt header are recognized", () => {
  const fields = extractReceiptFields(`קבלה מס׳ 1234
שם העסק: רות אדריכלות
סך הכול לתשלום
12 345,67 ₪`);
  assert.equal(fields.amount, "12345.67");
  assert.equal(fields.merchant, "רות אדריכלות");
  assert.equal(fields.reference, "1234");
});

test("request distinguishes issue date from payment deadline", () => {
  const fields = extractReceiptFields(`רשות מקרקעי ישראל
דרישת תשלום
מועד לתשלום: 30/11/2026
תאריך: 2026-10-02
מספר שובר: 123456789
דמי היוון
סכום לתשלום: 24,600 ₪`, { categories: [{ id: "rights", name: "זכויות ורמ״י" }] });
  assert.equal(fields.merchant, "רשות מקרקעי ישראל");
  assert.equal(fields.amount, "24600.00");
  assert.equal(fields.payment_status, "unpaid");
  assert.equal(fields.due_on, "2026-11-30");
  assert.equal(fields.spent_on, "2026-10-02");
  assert.equal(fields.category_id, "rights");
});

test("invoice alone does not imply payment", () => {
  const fields = extractReceiptFields(`יוסי קבלנות בע״מ
חשבונית מס 421
סה״כ כולל מע״מ: 5,900.00 ₪`);
  assert.equal(fields.document_type, "invoice");
  assert.equal(fields.payment_status, undefined);
  assert.equal(fields.amount, "5900.00");
  assert.match(fields.warnings.join(" "), /אינה אישור תשלום/);
});

test("quote suggests planned, not paid", () => {
  const fields = extractReceiptFields(`דנה תכנון בע״מ
הצעת מחיר
תכנון אדריכלי
סכום סופי: 15,000 ש״ח`);
  assert.equal(fields.document_type, "quote");
  assert.equal(fields.payment_status, "planned");
  assert.equal(fields.amount, "15000.00");
});

test("same-ranked conflicting totals require review", () => {
  const fields = extractReceiptFields(`יוסי עבודות
קבלה
סה״כ לתשלום: 1,000.00 ₪
סה״כ לתשלום: 2,000.00 ₪`);
  assert.equal(fields.amount, undefined);
  assert.deepEqual(fields.amount_candidates, ["1000.00", "2000.00"]);
});

test("identifiers, VAT, discounts and invalid dates never become a total", () => {
  const fields = extractReceiptFields(`קבלה
עוסק מורשה 512345678
טלפון: 054-1234567
מספר כרטיס: 1234
תאריך: 31/02/2026
מע״מ 18% ₪ 180.00
הנחה ₪ 100.00
עודף ₪ 20.00`);
  assert.equal(fields.amount, undefined);
  assert.equal(fields.merchant, undefined);
  assert.equal(fields.spent_on, undefined);
});

test("known supplier matches normalized Hebrew punctuation", () => {
  const fields = extractReceiptFields(`אור חשמל בע״מ
קבלה
סהכ לתשלום 100`, { merchants: ['אור חשמל בע"מ'] });
  assert.equal(fields.merchant, 'אור חשמל בע"מ');
});

test("customer names cannot be mistaken for the supplier", () => {
  const fields = extractReceiptFields(`קבלה
לכבוד
משק 48 בע״מ
סה״כ לתשלום 100 ₪`);
  assert.equal(fields.merchant, undefined);
});

test("category matching uses existing IDs and abstains when ambiguous", () => {
  const text = `ספק עבודות בע״מ
קבלה
התקנת חשמל ואינסטלציה
סהכ לתשלום 1000 ₪`;
  assert.equal(extractReceiptFields(text, { categories }).category_id, undefined);
  assert.equal(extractReceiptFields(text, { categories: [{ id: "general", name: "שונות" }] }).category_id, undefined);
});

test("money formats and malformed decimals", () => {
  for (const raw of ["1,234.56", "1.234,56", "1 234,56", "1234.56"])
    assert.equal(parseReceiptAmount(raw), "1234.56");
  assert.equal(parseReceiptAmount("1,234"), "1234.00");
  assert.equal(parseReceiptAmount("10,50"), "10.50");
  assert.equal(parseReceiptAmount("12.34.56"), undefined);
  assert.equal(parseReceiptAmount("0"), undefined);
  assert.equal(parseReceiptAmount("512345678"), undefined);
});

test("PDF Hebrew rows preserve reading order and amount digits", () => {
  const item = (str: string, x: number, y: number, dir = "rtl") => ({ str, dir, transform: [1, 0, 0, 1, x, y], width: 70, height: 12 });
  assert.equal(receiptPdfText([
    item("1,180.00", 10, 80, "ltr"), item('סה״כ לתשלום', 200, 80),
    item('אור חשמל בע״מ', 200, 100),
  ]), 'אור חשמל בע״מ\nסה״כ לתשלום 1,180.00');
});

test("OCR spacing loss and one-character supplier error match a unique known name", () => {
  const fields = extractReceiptFields(`אור חשמלבע״מ\nקבלה\nסהכ לתשלום 1180`, { merchants: ['אור חשמל בע"מ'] });
  assert.equal(fields.merchant, 'אור חשמל בע"מ');
  assert.equal(extractReceiptFields(`אור חשמנ בע״מ\nקבלה\nסהכ לתשלום 1180`, { merchants: ['אור חשמל בע"מ'] }).merchant, 'אור חשמל בע"מ');
});

test("ambiguous supplier similarity retains the scanned name", () => {
  const fields = extractReceiptFields(`אור חשמנ בע״מ\nקבלה\nסהכ לתשלום 1180`, { merchants: ['אור חשמל בע"מ', 'אור חשמק בע"מ'] });
  assert.equal(fields.merchant, 'אור חשמנ בע"מ');
  assert.deepEqual(fields.merchant_candidates, ['אור חשמנ בע"מ', 'אור חשמל בע"מ', 'אור חשמק בע"מ']);
});

test("confident extraction offers other labelled totals without an ambiguity warning", () => {
  const fields = extractReceiptFields(`שם הספק: אור חשמל בע״מ
קבלה
סה״כ לפני מע״מ 1000 ₪
מע״מ 180 ₪
סה״כ לתשלום 1180 ₪
סכום ששולם 600 ₪
עודף 20 ₪
מספר כרטיס: 1234
פריט 250 ₪
grand total USD 99`);
  assert.equal(fields.amount, "600.00");
  assert.deepEqual(fields.amount_candidates, []);
  assert.deepEqual(fields.amount_alternatives, ["600.00", "1180.00"]);
  assert.ok(!fields.warnings.some((warning) => warning.includes("כמה סכומים")));
});

test("supplier alternatives contain scanned names and close matches, never customers or unrelated saved suppliers", () => {
  const fields = extractReceiptFields(`שם הספק: אור חשמנ בע״מ
אור חשמנ בע״מ
רחוב העצמאות 15
לכבוד: משק 48
חברת הלקוח בע״מ
סה״כ לתשלום 100 ₪`, { merchants: ['אור חשמל בע"מ', 'ספק אחר בע"מ', 'חברת הלקוח בע"מ'] });
  assert.equal(fields.merchant, 'אור חשמל בע"מ');
  assert.deepEqual(fields.merchant_candidates, ['אור חשמל בע"מ', 'אור חשמנ בע"מ']);
});

test("exact supplier spellings and repeated totals are deduplicated", () => {
  const fields = extractReceiptFields(`אור חשמל בע״מ
אור חשמל בע"מ
קבלה
סה״כ לתשלום 100 ₪
סכום ששולם 100 ₪`, { merchants: ['אור חשמל בע"מ'] });
  assert.deepEqual(fields.merchant_candidates, ['אור חשמל בע"מ']);
  assert.deepEqual(fields.amount_alternatives, ["100.00"]);
});

test("zero, malformed and negative totals never offer unrelated prices as corrections", () => {
  for (const total of ["0.00", "-361.95", "361.950"]) {
    const fields = extractReceiptFields(`ספק בע״מ\nקבלה\nסה״כ לתשלום ${total} ₪\nמחיר פריט 20 ₪`);
    assert.deepEqual(fields.amount_alternatives, []);
  }
});

test("specific Hebrew fee chooses the matching existing RMI category", () => {
  const fields = extractReceiptFields(`רשות מקרקעי ישראל\nדרישת תשלום\nדמי היוון\nסהכ לתשלום 24600 ₪`, { categories: [
    { id: "permit", name: "רמ״י — דמי היתר" },
    { id: "rights", name: "רמ״י — רכישת זכויות והיוון" },
    { id: "lease", name: "רמ״י — חכירה והסדרת שימושים" },
  ] });
  assert.equal(fields.category_id, "rights");
});

test("OCR-mangled reference label falls back only to a document heading", () => {
  const fields = extractReceiptFields(`אור חשמלבע״מ\nחשבונית מס / קבלה ‘on004821\nתאריך:02/10/2026\nסהכ לתשלום ₪1180.00`);
  assert.equal(fields.reference, "004821");
});

test("Hebrew supplier name containing שח is not a currency marker", () => {
  const fields = extractReceiptFields(`שחר עבודות בע״מ\nקבלה\nסך הכול 123.45`);
  assert.equal(fields.merchant, 'שחר עבודות בע"מ');
  assert.equal(fields.amount, "123.45");
});

test("future receipt promise does not make an invoice paid", () => {
  const fields = extractReceiptFields(`אור חשמל בע״מ\nחשבונית מס\nקבלה תונפק לאחר התשלום\nסהכ לתשלום 1180 ₪`);
  assert.equal(fields.document_type, "invoice");
  assert.equal(fields.payment_status, undefined);
});

test("electricity bill finds the payable total, not kWh, VAT, fees or account numbers", () => {
  const fields = extractReceiptFields(`חברת החשמל לישראלבע״מ
חשבונית מס/קבלה - העתק נאמן למקור2021-491046350
מספר חשבון חוזה:341742993
מ- 31/05/2021 עד20/07/2021
תאריך עריכתהחשבון
www.iec.co.il
21/07/2021
חיוב בגין צריכה - סה״כ 615 קוט״ש 266.30
סה״כ ללאמע״מ 309.36
מע״מ 17.00% 52.59
סה״כ כולל מע״מ לתקופת חשבון 361.95
המסמך משמש קבלה רק לאחר הטבעת
חותמת הקופה ו/או חתימת הפקיד
יש לשלם חשבון זהעד
ל-10/08/2021.
סה״כ לתשלום(ש״ח) 361.95
תשלום בכרטיס אשראי מעל 10,000 ₪ יחויב בעמלה`, { categories: [{ id: "electric", name: "חשמל" }] });
  assert.equal(fields.amount, "361.95");
  assert.equal(fields.currency, "ILS");
  assert.equal(fields.merchant, 'חברת החשמל לישראל בע"מ');
  assert.equal(fields.reference, "2021-491046350");
  assert.equal(fields.spent_on, "2021-07-21");
  assert.equal(fields.due_on, "2021-08-10");
  assert.equal(fields.category_id, "electric");
  assert.equal(fields.payment_status, "unpaid");
  assert.equal(fields.notes, undefined);
});

test("electricity supplier OCR errors resolve using bill evidence without an existing supplier", () => {
  const fields = extractReceiptFields('חברת לשמל\nחשבון חשמל\nwww.iec.co.il\nסה״כ לתשלום 361.95 ₪', { categories: [{ id: 'electric', name: 'חשמל ותאורה' }] });
  assert.equal(fields.merchant, 'חברת החשמל לישראל בע"מ');
  assert.equal(fields.amount, '361.95');
  assert.equal(fields.category_id, 'electric');
  assert.equal(fields.document_type, 'payment_request');
  assert.equal(fields.payment_status, 'unpaid');
  // A mention in the customer's details cannot replace the actual supplier.
  const other = extractReceiptFields('שם הספק: אור עבודות בע״מ\nקבלה\nלכבוד: חברת החשמל\nwww.iec.co.il\nסה״כ לתשלום 100 ₪');
  assert.equal(other.merchant, 'אור עבודות בע"מ');
  assert.deepEqual(other.merchant_candidates, ['אור עבודות בע"מ']);
});

test("logo-only electricity PDFs use utility evidence and never the customer column as supplier", () => {
  const fields = extractReceiptFields(`חשבונית מס / קבלה
מספר חברה 520000472 לכבוד:
שם הלקוח בע״מ
מספר חשבון חוזה: 341742993
www.iec.co.il
חיוב בגין צריכה סה״כ 615 קוט״ש 266.30
סה״כ לתשלום 361.95 ₪`, { categories: [{ id: 'electric', name: 'חשמל' }] });
  assert.equal(fields.merchant, 'חברת החשמל לישראל בע"מ');
  assert.deepEqual(fields.merchant_candidates, ['חברת החשמל לישראל בע"מ']);
  assert.equal(fields.category_id, 'electric');
  const other = extractReceiptFields('חשבונית מס\nמספר חברה 520000472 לכבוד:\nשם הלקוח בע״מ\nסה״כ לתשלום 100 ₪');
  assert.equal(other.merchant, undefined);
  assert.deepEqual(other.merchant_candidates, []);
});

test("older electricity bill layouts and OCR heading artifacts cannot become supplier names", () => {
  for (const title of ['עמוד', '* | חשבון דוחודושי', '* | חשבון דוחודש\'']) {
    const fields = extractReceiptFields(`${title}\nחשבונית מס / קבלה\nמספר חברה 520000472 לכבוד:\nשם הלקוח\nמספר חוזה: 1234567\nwww.iec.co.il\nחיוב בגין צריכה 304קוט״ש\nסה״כ לתשלום 199.61 ₪`, { categories: [{ id: 'electric', name: 'חשמל' }] });
    assert.equal(fields.merchant, 'חברת החשמל לישראל בע"מ');
    assert.deepEqual(fields.merchant_candidates, ['חברת החשמל לישראל בע"מ']);
    assert.equal(fields.category_id, 'electric');
    assert.equal(fields.amount, '199.61');
  }
  assert.equal(extractReceiptFields('עמוד\n* | חשבון דוחודושי\nסה״כ לתשלום 100 ₪').merchant, undefined);
});

test("taxable base cannot compete with the final receipt total", () => {
  assert.equal(extractReceiptFields('ספק בע״מ\nחשבונית מס / קבלה\nסה״כ חייב במע״מ: ₪423.73\nסה״כ: ₪500.00\n₪500.00 :סה״כ').amount, "500.00");
});

test("French invoice uses tax-inclusive amount rather than HT or TVA", () => {
  const fields = extractReceiptFields('Free Mobile\nFacture no 123456\nTotal de la facture HT 7.92\nTVA 20% 1.58\nSomme a payer TTC 9.50');
  assert.equal(fields.amount, "9.50");
  assert.equal(fields.document_type, "invoice");
});

test("a zero-value invoice cannot turn a contact number or another currency amount into an expense", () => {
  const fields = extractReceiptFields('Free Mobile\nFacture no 123456\nSomme a payer TTC 0.00\nContact EUR 7289\nTotal de la facture HT 0.00');
  assert.equal(fields.amount, undefined);
  assert.ok(fields.warnings.some(warning => warning.includes('אפס')));
});

test("the stated payment amount outranks an insurance policy's USD premium", () => {
  const fields = extractReceiptFields('PassportCard\nקבלה\nהתשלום / זיכוי בסך 508.18 ש״ח בגין השרותים\nסכום ב- USD מטבע התשלום\nפוליסה 151.20 ILS');
  assert.equal(fields.amount, '508.18');
  assert.equal(fields.currency, 'ILS');
});

test("negative or malformed final amounts never fall back to fees elsewhere in the document", () => {
  for (const total of ['-361.95', '361.950']) {
    assert.equal(extractReceiptFields(`ספק בע״מ\nחשבונית\nסה״כ לתשלום ${total} ₪\nעמלת שירות USD 8.00`).amount, undefined);
  }
});
