import assert from "node:assert/strict";
import test from "node:test";
import { mergeReceiptFiles, receiptAutofill } from "../src/lib/receipt-entry.ts";
import { extractReceiptFields } from "../src/lib/receipt-ocr.ts";

test("automatic filling protects manual edits and never copies OCR text into notes", () => {
  const fields = extractReceiptFields('חברת החשמל לישראל בע״מ\nחשבונית מס / קבלה\nסה״כ לתשלום 361.95 ₪');
  const updates = receiptAutofill(fields, { merchant: "ספק ידני", amount: "125.00", notes: "הערה שלי" }, {}, new Set(["merchant", "amount"]));
  assert.equal(updates.merchant, undefined);
  assert.equal(updates.amount, undefined);
  assert.equal(updates.currency, "ILS");
  assert.equal(updates.notes, undefined);
  assert.equal(fields.notes, undefined);
});

test("switching receipt documents clears only untouched earlier extracted values", () => {
  const fields = extractReceiptFields('ספק חדש בע״מ\nחשבונית מס\nסה״כ לתשלום 180 ₪');
  const updates = receiptAutofill(fields, { reference: "12345", due_on: "2026-11-01", category_id: "manual" }, { reference: "12345", due_on: "2026-11-01" }, new Set(["category_id"]));
  assert.equal(updates.reference, "");
  assert.equal(updates.due_on, "");
  assert.equal(updates.category_id, undefined);
  assert.equal(updates.payment_status, "");
});

test("adding files preserves prior attachments, ignores cancel and duplicate selection, and enforces limits", () => {
  const first = new File(["invoice"], "invoice.pdf", { type: "application/pdf", lastModified: 1 });
  const second = new File(["photo"], "receipt.png", { type: "image/png", lastModified: 2 });
  assert.deepEqual(mergeReceiptFiles([first], []), [first]);
  assert.deepEqual(mergeReceiptFiles([first], [first, second]), [first, second]);
  assert.throws(() => mergeReceiptFiles([first], [new File(["data"], "x.exe", { type: "application/octet-stream" })]), /PDF/);
  assert.throws(() => mergeReceiptFiles([], Array.from({ length: 11 }, (_, index) => new File(["x"], `${index}.pdf`, { type: "application/pdf" }))), /10/);
  assert.throws(() => mergeReceiptFiles([], [new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" })]), /10 MB/);
});
