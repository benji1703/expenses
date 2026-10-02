import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import test from "node:test";
import { activeProfile, clearActiveProfile, listDrafts, loadSnapshot, putDraft, recreateDraft, removeDraft, saveSnapshot } from "../src/lib/offline-store.ts";
import type { PendingExpense } from "../src/lib/offline-types.ts";

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
