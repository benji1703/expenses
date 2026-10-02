import type { Expense } from "./expenses";
import type { OfflineProfile, OfflineSnapshot, PendingExpense } from "./offline-types";

const databaseName = "meshek48-offline-v1";
export const offlineChanged = "meshek48:offline-change";
let connection: Promise<IDBDatabase> | undefined;
function database() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("drafts", { keyPath: "operation_id" });
      request.result.createObjectStore("data");
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); connection = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { connection = undefined; reject(request.error); };
  });
  return connection;
}
async function access<T>(store: "drafts" | "data", mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = run(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("לא ניתן לשמור במכשיר."));
  });
}
function changed() { window.dispatchEvent(new Event(offlineChanged)); }
export async function activeProfile() { return access<OfflineProfile | undefined>("data", "readonly", (store) => store.get("active")); }
export async function saveSnapshot(snapshot: OfflineSnapshot) {
  const previous = await loadSnapshot(snapshot.profile.id);
  await access("data", "readwrite", (store) => store.put({
    ...snapshot,
    categories: snapshot.categories.length ? snapshot.categories : previous?.categories ?? [],
    saved_at: snapshot.ledger ? snapshot.saved_at : previous?.saved_at ?? snapshot.saved_at,
    // A page snapshot is a deliberate subset, never advertised as the complete ledger.
    expenses: snapshot.ledger ? snapshot.expenses : previous?.expenses ?? [],
  }, snapshot.profile.id));
  await access("data", "readwrite", (store) => store.put(snapshot.profile, "active"));
  if (snapshot.profile.role !== "read_only") {
    for (const draft of await listDrafts(snapshot.profile.id)) {
      if (draft.blocked && [401, 403].includes(draft.error_code ?? 0)) await putDraft({ ...draft, blocked: false, error: undefined, error_code: undefined });
    }
  }
  changed();
}
export async function loadSnapshot(owner: string) { return access<OfflineSnapshot | undefined>("data", "readonly", (store) => store.get(owner)); }
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
  const snapshot = await loadSnapshot(owner);
  if (snapshot) await access("data", "readwrite", (store) => store.put({ ...snapshot, expenses: [expense, ...snapshot.expenses.filter((item) => item.id !== expense.id)], saved_at: new Date().toISOString() }, owner));
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
