import { expenseSchema, type Expense } from "./expenses.ts";
import type { PendingExpense } from "./offline-types.ts";
import { ledgerFilters } from "./ledger-filters.ts";

export function localLedger(expenses: Expense[], drafts: PendingExpense[]) {
  const rows = new Map(expenses.map((expense) => [expense.id, expense]));
  for (const draft of drafts) {
    const parsed = expenseSchema.safeParse(draft.fields);
    if (!parsed.success) continue;
    const previous = rows.get(draft.expense_id);
    rows.set(draft.expense_id, { ...previous, ...parsed.data, id: draft.expense_id,
      amount: Number(parsed.data.amount), created_by: previous?.created_by ?? draft.owner,
      receipt_path: previous?.receipt_path ?? null, updated_at: draft.expected_updated_at ?? undefined,
    });
  }
  return [...rows.values()].sort((a, b) => b.spent_on.localeCompare(a.spent_on));
}

export function filterLocalLedger(expenses: Expense[], url: URL) {
  const routeCategory = url.pathname.startsWith("/categories/") ? url.pathname.split("/")[2] : "";
  const { search, month, categoryId: category } = ledgerFilters(url.searchParams, routeCategory);
  if (routeCategory && !category) return [];
  const query = search.toLocaleLowerCase();
  return expenses.filter((expense) => expense.merchant.toLocaleLowerCase().includes(query) &&
    (!category || expense.category_id === category) && (!month || expense.spent_on.startsWith(month)));
}
