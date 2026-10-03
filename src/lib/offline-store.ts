import type { Category, Expense } from "./expenses";
import type { OfflineProfile, OfflineSnapshot, PendingExpense } from "./offline-types";

import { OfflineDatabase } from "./offline-database.ts";

export const offlineChanged = "meshek48:offline-change";
const database = new OfflineDatabase("meshek48-offline-v1");
const access = database.access.bind(database);
function changed() { window.dispatchEvent(new Event(offlineChanged)); }
export async function activeProfile() { return access<OfflineProfile | undefined>("data", "readonly", (store) => store.get("active")); }
export async function saveSnapshot(snapshot: OfflineSnapshot) {
  await database.update<OfflineSnapshot>(snapshot.profile.id, (previous) => ({
    ...snapshot,
    categories: snapshot.categories.length ? snapshot.categories : previous?.categories ?? [],
    saved_at: snapshot.ledger ? snapshot.saved_at : previous?.saved_at ?? snapshot.saved_at,
    // A page snapshot is a deliberate subset, never advertised as the complete ledger.
    expenses: snapshot.ledger ? snapshot.expenses : previous?.expenses ?? [],
  }), { key: "active", value: snapshot.profile });
  if (snapshot.profile.role !== "read_only") {
    for (const draft of await listDrafts(snapshot.profile.id)) {
      if (draft.blocked && [401, 403].includes(draft.error_code ?? 0)) await putDraft({ ...draft, blocked: false, error: undefined, error_code: undefined });
    }
  }
  changed();
}
export async function loadSnapshot(owner: string) { return access<OfflineSnapshot | undefined>("data", "readonly", (store) => store.get(owner)); }
export async function cacheCreatedCategory(category: Category) {
  const profile = await activeProfile();
  if (!profile) return;
  await database.update<OfflineSnapshot>(profile.id, (snapshot) => snapshot ? {
    ...snapshot, categories: [...snapshot.categories.filter((item) => item.id !== category.id), category],
  } : undefined);
  changed();
}
export async function clearActiveProfile() {
  await access("data", "readwrite", (store) => store.delete("active"));
  // Pending drafts stay isolated by owner and can resume after that owner signs in again.
  changed();
}
export async function listDrafts(owner: string): Promise<PendingExpense[]> {
  const drafts = await access<PendingExpense[]>("drafts", "readonly", (store) => store.getAll());
  return drafts.filter((draft) => draft.owner === owner).sort((a, b) => a.created_at.localeCompare(b.created_at));
}
export async function putDraft(draft: PendingExpense) { await access("drafts", "readwrite", (store) => store.put(draft)); changed(); }
export async function removeDraft(operation: string) { await access("drafts", "readwrite", (store) => store.delete(operation)); changed(); }
export async function cacheSyncedExpense(owner: string, expense: Expense) {
  await database.update<OfflineSnapshot>(owner, (snapshot) => snapshot ? {
    ...snapshot, expenses: [expense, ...snapshot.expenses.filter((item) => item.id !== expense.id)], saved_at: new Date().toISOString(),
  } : undefined);
}

export async function recreateDraft(draft: PendingExpense) {
  const operation = crypto.randomUUID();
  await putDraft({ ...draft, operation_id: operation, expense_id: operation, editing: false, expected_updated_at: null,
    blocked: false, error: undefined, error_code: undefined, created_at: new Date().toISOString(),
    files: draft.files.map((file) => {
      const id = crypto.randomUUID(), extension = file.type === "application/pdf" ? "pdf" : file.type === "image/jpeg" ? "jpg" : "png";
      return { ...file, id, path: `${draft.owner}/${operation}/${id}.${extension}` };
    }),
  });
  await removeDraft(draft.operation_id);
}
