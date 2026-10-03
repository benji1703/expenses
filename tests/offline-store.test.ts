import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import test from "node:test";
import { activeProfile, clearActiveProfile, listDrafts, loadSnapshot, putDraft, recreateDraft, removeDraft, saveSnapshot } from "../src/lib/offline-store.ts";
import type { PendingExpense } from "../src/lib/offline-types.ts";
import type { Expense } from "../src/lib/expenses.ts";
import { OfflineDatabase } from "../src/lib/offline-database.ts";

test("durable drafts keep receipt blobs and stay isolated across accounts", async () => {
  Object.defineProperty(globalThis, "indexedDB", { value: indexedDB, configurable: true });
  Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true });
  const profile = { id: "owner-a", email: "a@example.com", role: "admin" as const };
  await saveSnapshot({ profile, categories: [{ id: "category", name: "חשמל", color: "#abcdef" }], expenses: [], ledger: true, saved_at: "2026-10-02T10:00:00Z" });
  const draft: PendingExpense = { operation_id: "stable-operation", owner: profile.id, expense_id: "stable-expense", editing: false,
    expected_updated_at: null, fields: { merchant: "ספק", amount: "1180.00" }, created_at: "2026-10-02T10:00:00Z",
    files: [{ id: "attachment", path: "owner-a/expense/attachment.pdf", name: "קבלה.pdf", type: "application/pdf", blob: new Blob(["%PDF-test"], { type: "application/pdf" }) }] };
  await putDraft(draft);
  const loaded = await listDrafts(profile.id);
  assert.equal(loaded.length, 1);
  assert.equal(await loaded[0].files[0].blob.text(), "%PDF-test");
  assert.deepEqual(await listDrafts("owner-b"), []);
  await clearActiveProfile();
  assert.equal(await activeProfile(), undefined);
  assert.equal((await listDrafts(profile.id)).length, 1); // sign-out never deletes unsynced work
  await saveSnapshot({ profile, categories: [], expenses: [], saved_at: "2026-10-02T11:00:00Z" });
  assert.equal((await activeProfile())?.id, profile.id);
  assert.equal((await loadSnapshot(profile.id))?.categories[0].name, "חשמל");
  assert.equal((await loadSnapshot(profile.id))?.saved_at, "2026-10-02T10:00:00Z");
  await recreateDraft(draft);
  const recovered = (await listDrafts(profile.id))[0];
  assert.notEqual(recovered.operation_id, draft.operation_id);
  assert.equal(recovered.operation_id, recovered.expense_id);
  assert.notEqual(recovered.files[0].id, draft.files[0].id);
  assert.equal(await recovered.files[0].blob.text(), "%PDF-test");
  await removeDraft(recovered.operation_id);
  assert.deepEqual(await listDrafts(profile.id), []);
});

test("category created inside an expense remains selectable after losing connection", async () => {
  const { cacheCreatedCategory } = await import("../src/lib/offline-store.ts");
  Object.defineProperty(globalThis, "indexedDB", { value: indexedDB, configurable: true });
  Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true });
  const profile = { id: "category-owner", email: "category@example.com", role: "admin" as const };
  await saveSnapshot({ profile, categories: [], expenses: [], ledger: true, saved_at: "2026-10-02T10:00:00Z" });
  const category = { id: "created-category", name: "עבודות חשמל", color: "#9b8c7c" };
  await cacheCreatedCategory(category); await cacheCreatedCategory(category);
  assert.deepEqual((await loadSnapshot(profile.id))?.categories, [category]);
  assert.equal((await loadSnapshot(profile.id))?.saved_at, "2026-10-02T10:00:00Z");
  await clearActiveProfile();
  await cacheCreatedCategory({ ...category, id: "signed-out" });
  assert.equal((await loadSnapshot(profile.id))?.categories.length, 1);
});

test("concurrent category, expense and page cache updates retain all completed local writes", async () => {
  const { cacheCreatedCategory, cacheSyncedExpense } = await import("../src/lib/offline-store.ts");
  Object.defineProperty(globalThis, "indexedDB", { value: indexedDB, configurable: true });
  Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true });
  const profile = { id: "concurrent-owner", email: "concurrent@example.com", role: "admin" as const };
  await saveSnapshot({ profile, categories: [], expenses: [], ledger: true, saved_at: "2026-10-03T10:00:00Z" });
  const expense = { id: "one", merchant: "ספק", amount: 100, currency: "ILS", spent_on: "2026-10-03", notes: "", category_id: "first", created_by: profile.id,
    payment_status: "paid", due_on: null, reference: "", stage: "construction", receipt_path: null } satisfies Expense;
  await Promise.all([
    cacheCreatedCategory({ id: "first", name: "חשמל", color: "#abcdef" }),
    cacheCreatedCategory({ id: "second", name: "מים", color: "#abcdef" }),
    cacheSyncedExpense(profile.id, expense),
    cacheSyncedExpense(profile.id, { ...expense, id: "two" }),
    saveSnapshot({ profile, categories: [], expenses: [], saved_at: "2026-10-03T11:00:00Z" }),
  ]);
  const snapshot = await loadSnapshot(profile.id);
  assert.deepEqual(new Set(snapshot?.categories.map((item) => item.id)), new Set(["first", "second"]));
  assert.deepEqual(new Set(snapshot?.expenses.map((item) => item.id)), new Set(["one", "two"]));
});

test("database update failures roll back, and an unavailable connection can retry", async () => {
  Object.defineProperty(globalThis, "indexedDB", { value: undefined, configurable: true });
  const database = new OfflineDatabase("meshek-test-recovery");
  await assert.rejects(database.access("data", "readonly", (store) => store.get("value")));
  Object.defineProperty(globalThis, "indexedDB", { value: indexedDB, configurable: true });
  await database.update<number>("value", () => 1);
  await assert.rejects(database.update<number>("value", () => { throw new Error("cannot update"); }, { key: "active", value: "changed" }), /cannot update/);
  assert.equal(await database.access("data", "readonly", (store) => store.get("value")), 1);
  assert.equal(await database.access("data", "readonly", (store) => store.get("active")), undefined);
});
