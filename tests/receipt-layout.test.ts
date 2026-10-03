import assert from "node:assert/strict";
import test from "node:test";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { extractReceiptFields, receiptPdfText, receiptOcrText, type PdfTextItem } from "../src/lib/receipt-ocr.ts";
import { readReceiptPdf } from "../src/lib/receipt-pdf.ts";

const item = (str: string, x: number, y: number, width: number, height = 10): PdfTextItem => ({ str, dir: /[א-ת]/.test(str) ? "rtl" : "ltr", transform: [1, 0, 0, 1, x, y], width, height });
// Anonymized municipal-bill layout: each Hebrew letter is a separate PDF item.
// No customer name, address, ID or source document is retained in this fixture.
function hebrewGlyphs(text: string, right: number, y: number, height = 10) {
  const glyphs: PdfTextItem[] = [];
  for (const letter of text) {
    if (letter === " ") { right -= height * 0.28; continue; }
    const width = height * 0.5;
    right -= width; glyphs.push(item(letter, right, y, width, height));
  }
  return glyphs;
}
function municipalBill() {
  return [
    ...hebrewGlyphs("קבלה למשלם", 370, 800), item("1", 375, 800, 5),
    item("15.06.2026", 450, 780, 55), item("4", 375, 780, 5),
    ...hebrewGlyphs("מרכז שירות לתושב מספר רשות", 365, 780), item("487000", 160, 780, 35),
    item("לוגו רעננה", 250, 760, 50), item("07-08/26", 360, 740, 45),
    ...hebrewGlyphs("ארנונה חיוב תקופתי", 540, 640), item("1,311.40", 260, 640, 45),
    ...hebrewGlyphs("משרת מילואים פעיל", 540, 625), item("-65.60", 260, 625, 35),
    ...hebrewGlyphs("אגרת שמירה", 540, 610), item("51.30", 260, 610, 30),
    item("6001234500", 468, 557, 44), item("14/07/26", 370, 558, 33), item("1,297.10", 262, 559, 42, 13),
    item("מס׳ מסלקה לתשלום דו-חודשי בלבד", 446, 548, 97, 7),
    item("לתשלום עד", 369, 548, 32, 7), item("ט.ל.ח", 294, 548, 15, 7),
    ...hebrewGlyphs("הסכום לתשלום", 283, 548, 7),
  ];
}

test("fragmented Hebrew municipal PDF links the comma-decimal total above its label, not the account or period", async () => {
  let pagesRead = 0;
  const pdf = { numPages: 2, getPage: async () => {
    pagesRead++;
    return { getTextContent: async () => ({ items: [...municipalBill()].reverse() }), cleanup: () => {} };
  } } as unknown as PDFDocumentProxy;
  const context = { categories: [{ id: "municipal", name: "ארנונה" }] };
  const text = await readReceiptPdf(pdf, { context, render: async () => assert.fail("digital total needs no raster"), recognize: async () => assert.fail("digital total needs no OCR") });
  const fields = extractReceiptFields(text, context);
  assert.equal(fields.amount, "1297.10");
  assert.equal(fields.merchant, "עיריית רעננה");
  assert.equal(fields.currency, "ILS");
  assert.equal(fields.document_type, "payment_request");
  assert.equal(fields.payment_status, "unpaid");
  assert.equal(fields.spent_on, "2026-06-15");
  assert.equal(fields.due_on, "2026-07-14");
  assert.equal(fields.category_id, "municipal");
  assert.deepEqual(fields.amount_candidates, []);
  assert.deepEqual(fields.amount_alternatives, ["1297.10"]);
  assert.equal(pagesRead, 1);
});

test("numeric glyphs keep left-to-right order within a right-to-left total row", () => {
  const items = [...hebrewGlyphs('סה״כ לתשלום', 300, 100)];
  let x = 20;
  for (const digit of "1,297.10") { items.push(item(digit, x, 100, 5)); x += 5; }
  const text = receiptPdfText(items.reverse());
  assert.match(text, /סה״כ לתשלום 1,297\.10/);
  assert.equal(extractReceiptFields(text).amount, "1297.10");
  assert.equal(extractReceiptFields('קבלה\nסה״כ לתשלום ₪ 1.00').amount, "1.00");
});

test("a total label cannot adopt a numeric cell in another column or far away", () => {
  for (const value of [item("1", 10, 90, 5), item("1", 250, 20, 5)]) {
    const text = receiptPdfText([item("הסכום לתשלום", 240, 100, 70), value]);
    assert.equal(extractReceiptFields(text).amount, undefined);
  }
});

test("equally close vertical totals require a choice rather than guessing the next row", () => {
  const text = receiptPdfText([item("הסכום לתשלום", 240, 100, 70), item("100.00", 250, 85, 40), item("200.00", 250, 115, 40)]);
  const fields = extractReceiptFields(text);
  assert.equal(fields.amount, undefined);
  assert.deepEqual(new Set(fields.amount_candidates), new Set(["100.00", "200.00"]));
});

test("OCR word boxes link a payable value above its small caption in parallel columns", () => {
  const word = (text: string, x: number, y: number, width: number, height = 14) => ({ text, bbox: { x0: x, x1: x + width, y0: y, y1: y + height } });
  const text = receiptOcrText([
    { ...word("1,297.10 14/07/26 6001234500", 200, 300, 500, 22), words: [word("1,297.10", 200, 300, 110, 22), word("14/07/26", 390, 300, 100, 22), word("6001234500", 600, 300, 100, 22)] },
    { ...word("הסכום לתשלום לתשלום עד", 210, 330, 290), words: [word("הסכום", 266, 330, 40), word("לתשלום", 210, 330, 50), word("לתשלום", 440, 330, 50), word("עד", 416, 330, 18)] },
  ]);
  const fields = extractReceiptFields(text);
  assert.equal(fields.amount, "1297.10");
  assert.equal(fields.due_on, "2026-07-14");
});

test("currency-only small numbers cannot fill or prevent PDF OCR fallback", async () => {
  const fields = extractReceiptFields("קבלה\n₪ 1");
  assert.equal(fields.amount, undefined);
  assert.deepEqual(fields.amount_candidates, ["1.00"]);
  let renders = 0;
  const pdf = { numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [item("קבלה", 300, 100, 30), item("₪ 1", 100, 50, 25)] }), cleanup: () => {} }) } as unknown as PDFDocumentProxy;
  const text = await readReceiptPdf(pdf, { context: {}, render: async () => { renders++; return new Blob(); }, recognize: async () => 'שם הספק: ספק בע״מ\nקבלה\nסה״כ לתשלום 1,297.10 ₪' });
  assert.equal(renders, 1);
  assert.equal(extractReceiptFields(text).amount, "1297.10");
});

test("payment instructions and municipal numbered notices cannot become totals", () => {
  for (const text of ['1. יש לשלם את הסכום לתשלום בתוך 6 ימים', 'ניתן לשלם 1 ₪ בסניפי הדואר', 'מסלקה לתשלום 6001234500', 'לתשלום עד 14/07/26']) {
    assert.equal(extractReceiptFields(text).amount, undefined);
  }
});

test("a PDF issuer and tax ID in parallel columns fill the supplier and business header, excluding customer details", async () => {
  const items = [
    item('אור ספורט בע״מ', 450, 802, 120, 14), item('עוסק מורשה 512345678', 30, 802, 130, 14),
    item('המלאכה 25, רעננה 43345', 435, 787, 135, 14), item('0501234567 :טלפון', 470, 772, 100, 14),
    item('חשבונית מס קבלה', 450, 670, 120, 14), item('לכבוד:', 520, 642, 50, 14),
    item('חברת הלקוח בע״מ', 450, 626, 120, 14), item('עוסק מורשה 599999999', 30, 626, 130, 14),
    item('רחוב הלקוח 10, תל אביב', 435, 610, 135, 14), item('טלפון: 0509999999', 450, 594, 120, 14),
    item('סה״כ לתשלום 380.00 ₪', 240, 550, 150, 14),
  ];
  const pdf = { numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items }), cleanup: () => {} }) } as unknown as PDFDocumentProxy;
  const text = await readReceiptPdf(pdf, { context: {}, render: async () => assert.fail('readable header needs no raster'), recognize: async () => assert.fail('readable header needs no OCR') });
  const fields = extractReceiptFields(text);
  assert.equal(fields.merchant, 'אור ספורט בע"מ');
  assert.equal(fields.notes, 'אור ספורט בע"מ\nהמלאכה 25, רעננה 43345\nטלפון: 0501234567\nעוסק מורשה 512345678');
  assert.equal(fields.amount, '380.00');
  assert.equal(fields.document_type, 'tax_receipt');
  assert.equal(fields.payment_status, 'paid');
  assert.deepEqual(fields.merchant_candidates, ['אור ספורט בע"מ']);
});
