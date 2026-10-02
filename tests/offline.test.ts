import assert from "node:assert/strict";
import test from "node:test";
import { sameExpenseFields } from "../src/lib/offline-types.ts";

test("lost acknowledgement can be retried without overwriting newer edits", () => {
  const fields = { merchant: "אור חשמל", amount: 1180, currency: "ILS", due_on: null, notes: "התקנת לוח" };
  const saved = { ...fields, amount: "1180.00", updated_at: "2026-10-02T10:00:00Z" };
  assert.equal(sameExpenseFields(saved, fields), true);
  assert.equal(sameExpenseFields({ ...saved, amount: 2000 }, fields), false);
  assert.equal(sameExpenseFields({ ...saved, notes: "שינוי במכשיר אחר" }, fields), false);
});
