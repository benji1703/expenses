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

test("business header notes fill automatically but preserve existing or manually edited notes", () => {
  const fields = extractReceiptFields('אור ספורט בע״מ עוסק מורשה 512345678\nהמלאכה 25, רעננה 43345\n0501234567 :טלפון\nחשבונית מס קבלה\nסה״כ לתשלום 380 ₪');
  const notes = 'אור ספורט בע"מ\nהמלאכה 25, רעננה 43345\nטלפון: 0501234567\nעוסק מורשה 512345678';
  assert.equal(receiptAutofill(fields, { notes: '' }, {}, new Set()).notes, notes);
  assert.equal(receiptAutofill(fields, { notes: 'הערה שלי' }, {}, new Set()).notes, undefined);
  assert.equal(receiptAutofill(fields, { notes: '' }, {}, new Set(['notes'])).notes, undefined);
  assert.equal(receiptAutofill(fields, { notes: 'כותרת קודמת' }, { notes: 'כותרת קודמת' }, new Set()).notes, notes);
});

test("changing documents replaces or clears only automatically filled header notes", () => {
  const noHeader = extractReceiptFields('ספק חדש בע״מ\nקבלה\nסה״כ לתשלום 100 ₪');
  assert.equal(receiptAutofill(noHeader, { notes: 'כותרת קודמת' }, { notes: 'כותרת קודמת' }, new Set()).notes, '');
  assert.equal(receiptAutofill(noHeader, { notes: 'שיניתי את ההערה' }, { notes: 'כותרת קודמת' }, new Set()).notes, undefined);
});

test("header notes require issuer registration and never include customer details or invoice rows", () => {
  assert.equal(extractReceiptFields('ספק ספורט בע״מ\nקבלה\nלכבוד: לקוח\nעוסק מורשה 512345678\nרחוב הלקוח 10\nטלפון: 0501234567\nסה״כ לתשלום 100 ₪').notes, undefined);
  const fields = extractReceiptFields('שם הספק: ספק ספורט בע״מ\n512345678 :עוסק מורשה\nרחוב העסק 25\nטלפון: 0501234567\nקבלה\nלכבוד: לקוח\nרחוב הלקוח 10\nסה״כ לתשלום 100 ₪');
  assert.equal(fields.merchant, 'ספק ספורט בע"מ');
  assert.equal(fields.notes, 'ספק ספורט בע"מ\nרחוב העסק 25\nטלפון: 0501234567\nעוסק מורשה 512345678');
  assert.equal(extractReceiptFields('ספק ספורט בע״מ\nעוסק מורשה 512345678\nעוסק מורשה 599999999\nקבלה\nסה״כ לתשלום 100 ₪').notes, undefined);
  assert.equal(extractReceiptFields('סטודיו ספורט\nעוסק פטור 512345678\nרחוב העסק 25\nחשבונית\nאימון ספורט ברחוב אחר 99\nסה״כ לתשלום 100 ₪').notes, 'סטודיו ספורט\nרחוב העסק 25\nעוסק פטור 512345678');
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
