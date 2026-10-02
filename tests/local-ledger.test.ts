import assert from "node:assert/strict";
import test from "node:test";
import { filterLocalLedger, localLedger } from "../src/lib/local-ledger.ts";
import type { Expense } from "../src/lib/expenses.ts";
import type { PendingExpense } from "../src/lib/offline-types.ts";

test("local creation and edits appear once and obey the normal route filters", () => {
  const category = "cccccccc-cccc-4ccc-bccc-cccccccccccc";
  const saved: Expense = { id: "existing", merchant: "אור חשמל", amount: 100, currency: "ILS", spent_on: "2026-09-02", category_id: category, payment_status: "paid", stage: "construction", notes: "", due_on: null, reference: "", receipt_path: null, created_by: "owner" };
  const pending = (id: string, amount: string): PendingExpense => ({ operation_id: id, expense_id: id, owner: "owner", editing: id === saved.id, expected_updated_at: null, files: [], created_at: "2026-10-02T10:00:00Z", fields: { merchant: "אור חשמל", amount, currency: "ILS", spent_on: "2026-10-02", category_id: category, payment_status: "paid", stage: "construction", notes: "", due_on: "", reference: "" } });
  const rows = localLedger([saved], [pending("new", "1180"), pending("existing", "250")]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.id === saved.id)?.amount, 250);
  assert.equal(rows.find((row) => row.id === "new")?.created_by, "owner");
  assert.equal(filterLocalLedger(rows, new URL(`https://test/categories/${category}?month=2026-10&q=חשמל`)).length, 2);
  assert.equal(filterLocalLedger(rows, new URL("https://test/expenses?month=2026-09")).length, 0);
  assert.equal(filterLocalLedger(rows, new URL("https://test/categories/other?category=" + category)).length, 0);
  assert.equal(filterLocalLedger(rows, new URL("https://test/expenses?q=אדריכל")).length, 0);
  assert.equal(localLedger([saved], [{ ...pending("bad", "-1") }]).length, 1);
});
