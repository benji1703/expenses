import type { Category, Expense } from "./expenses.ts";

export type OfflineRole = "admin" | "member" | "read_only";
export type OfflineProfile = { id: string; email: string; role: OfflineRole };
export type OfflineSnapshot = {
  profile: OfflineProfile;
  categories: Category[];
  expenses: Expense[];
  saved_at: string;
  ledger?: boolean;
};
export type PendingExpense = {
  operation_id: string;
  owner: string;
  expense_id: string;
  editing: boolean;
  expected_updated_at: string | null;
  fields: Record<string, string>;
  files: { id: string; name: string; type: string; path: string; blob: Blob }[];
  created_at: string;
  error?: string;
  blocked?: boolean;
  error_code?: number;
};

export function sameExpenseFields(saved: Record<string, unknown>, incoming: Record<string, unknown>) {
  return Object.keys(incoming).every((key) => key === "amount"
    ? Number(saved[key]) === Number(incoming[key])
    : (saved[key] ?? "") === (incoming[key] ?? ""));
}
