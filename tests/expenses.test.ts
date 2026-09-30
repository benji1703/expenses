import test from "node:test";
import assert from "node:assert/strict";
import { expenseSchema, receiptExtension } from "../src/lib/expenses.ts";
const valid = {
  merchant: "Market",
  amount: "12.34",
  currency: "ILS",
  spent_on: "2026-09-30",
  category_id: "11847c20-afc9-4b2a-b499-551081bd137e",
  notes: "",
};
test("expense validation rejects malformed money, dates, and missing categories", () => {
  assert.equal(expenseSchema.safeParse(valid).success, true);
  for (const amount of ["0", "-1", "1.234", "Infinity", "1e3", "999999999.99"])
    assert.equal(expenseSchema.safeParse({ ...valid, amount }).success, false);
  assert.equal(
    expenseSchema.safeParse({ ...valid, spent_on: "2026-02-30" }).success,
    false,
  );
  assert.equal(
    expenseSchema.safeParse({ ...valid, category_id: "" }).success,
    false,
  );
  assert.equal(
    expenseSchema.safeParse({ ...valid, currency: "BOGUS" }).success,
    false,
  );
});
test("receipt validation checks content signature as well as declared MIME", () => {
  assert.equal(
    receiptExtension(new TextEncoder().encode("%PDF-1.7"), "application/pdf"),
    "pdf",
  );
  assert.equal(
    receiptExtension(new Uint8Array([255, 216, 255]), "image/jpeg"),
    "jpg",
  );
  assert.equal(
    receiptExtension(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      "image/png",
    ),
    "png",
  );
  assert.equal(
    receiptExtension(
      new TextEncoder().encode("<script>alert(1)</script>"),
      "application/pdf",
    ),
    null,
  );
  assert.equal(
    receiptExtension(new TextEncoder().encode("%PDF-1.7"), "image/jpeg"),
    null,
  );
});
