import assert from "node:assert/strict";
import test from "node:test";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { readReceiptPdf } from "../src/lib/receipt-pdf.ts";
import { extractReceiptFields, receiptOcrText, receiptImageSize } from "../src/lib/receipt-ocr.ts";

const item = (str: string, y: number, x = 200) => ({ str, dir: "rtl", transform: [1, 0, 0, 1, x, y], width: 80, height: 12 });
function document(pages: ReturnType<typeof item>[][], declaredCount = pages.length) {
  const read: number[] = [], cleaned: number[] = [];
  return { read, cleaned, pdf: { numPages: declaredCount, getPage: async (number: number) => {
    read.push(number);
    return { getTextContent: async () => ({ items: pages[number - 1] }), cleanup: () => cleaned.push(number) };
  } } as unknown as PDFDocumentProxy };
}

test("digital invoices stop after the first complete page without rendering or loading OCR", async () => {
  const fixture = document([[item('חברת החשמל לישראל בע״מ', 100), item('חשבונית מס / קבלה', 80), item('סה״כ לתשלום', 60), item('361.95', 60, 10)]], 14);
  const text = await readReceiptPdf(fixture.pdf, { context: {}, recognize: async () => assert.fail("OCR should stay unloaded"), render: async () => assert.fail("digital PDF should stay digital") });
  assert.equal(extractReceiptFields(text).amount, "361.95");
  assert.deepEqual(fixture.read, [1]);
  assert.deepEqual(fixture.cleaned, [1]);
});

test("scanned PDF fallback reads a later page when the first page lacks receipt fields", async () => {
  const fixture = document([[], []]); let renders = 0, scans = 0;
  const text = await readReceiptPdf(fixture.pdf, { context: {}, render: async () => { renders++; return new Blob(); }, recognize: async () => ++scans === 1 ? '' : 'ספק חשמל בע״מ\nקבלה\nסה״כ לתשלום 361.95 ₪' });
  assert.equal(extractReceiptFields(text).amount, "361.95");
  assert.equal(renders, 2);
  assert.deepEqual(fixture.cleaned, [1, 2]);
});

test("conflicting embedded totals remain editable candidates without an expensive OCR retry", async () => {
  const fixture = document([[item('ספק בע״מ', 100), item('קבלה', 80), item('סה״כ לתשלום 100 ₪', 60), item('סה״כ לתשלום 200 ₪', 40)]], 2);
  const text = await readReceiptPdf(fixture.pdf, { context: {}, render: async () => assert.fail("unnecessary render"), recognize: async () => assert.fail("unnecessary OCR") });
  assert.deepEqual(extractReceiptFields(text).amount_candidates, ['100.00', '200.00']);
  assert.deepEqual(fixture.read, [1]);
});

test("long partial text layers still OCR an image-only payable total and retain digital metadata", async () => {
  const fixture = document([[item('חברת החשמל לישראל בע״מ', 100), item('חשבונית מס / קבלה', 80), item('תאריך: 21/07/2021', 60), item('הודעה לצרכנים '.repeat(30), 40)]]);
  let renders = 0;
  const text = await readReceiptPdf(fixture.pdf, { context: { categories: [{ id: "electric", name: "חשמל" }] }, render: async () => { renders++; return new Blob(); }, recognize: async () => 'סה״כ לתשלום (ש״ח) 361.95' });
  const fields = extractReceiptFields(text, { categories: [{ id: "electric", name: "חשמל" }] });
  assert.equal(renders, 1);
  assert.equal(fields.amount, '361.95');
  assert.equal(fields.merchant, 'חברת החשמל לישראל בע"מ');
  assert.equal(fields.spent_on, '2021-07-21');
  assert.equal(fields.category_id, 'electric');
});

test("zero-value digital bills stay digital without OCR inventing an expense", async () => {
  const fixture = document([[item('חברת החשמל לישראל בע״מ', 100), item('חשבונית מס', 80), item('סה״כ לתשלום 0.00 ₪', 60)]]);
  const text = await readReceiptPdf(fixture.pdf, { context: {}, render: async () => assert.fail("zero bill should not render"), recognize: async () => assert.fail("zero bill should not OCR") });
  assert.equal(extractReceiptFields(text).zero_total, true);
});

test("OCR spatial rows join detached columns without changing Hebrew or decimal digits", () => {
  const line = (text: string, x: number, y: number) => ({ text, bbox: { x0: x, x1: x + 90, y0: y, y1: y + 20 } });
  const text = receiptOcrText([line('361.95', 40, 150), line('סה״כ לתשלום (ש״ח)', 300, 152), line('חשבונית מס / קבלה', 300, 80), line('חברת החשמל לישראל בע״מ', 300, 40)]);
  const fields = extractReceiptFields(text);
  assert.equal(fields.amount, '361.95'); assert.equal(fields.currency, 'ILS');
  assert.equal(fields.merchant, 'חברת החשמל לישראל בע"מ');
  assert.match(text, /סה״כ לתשלום \(ש״ח\) 361.95/);
  for (const [width, height] of [[596, 842], [1014, 1071], [10000, 14000], [350, 9000]]) {
    const output = receiptImageSize(width, height);
    assert.ok(output.width * output.height <= 6_010_000);
    assert.ok(Math.abs(output.width / output.height - width / height) < 0.01);
  }
});
