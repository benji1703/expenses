import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { indexedDB } from "fake-indexeddb";
import ts from "typescript";
import test from "node:test";
import * as store from "../src/lib/offline-store.ts";
import { expenseSchema, receiptExtension } from "../src/lib/expenses.ts";
import type { OfflineProfile } from "../src/lib/offline-types.ts";

const require = createRequire(import.meta.url);
const profile: OfflineProfile = { id: "aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa", email: "test@example.com", role: "admin" };
function form() {
  const data = new FormData();
  Object.entries({ merchant: "אור חשמל", amount: "1180.00", currency: "ILS", payment_status: "paid", due_on: "", reference: "4821", stage: "construction", spent_on: "2026-10-02", category_id: "cccccccc-cccc-4ccc-bccc-cccccccccccc", notes: "התקנת לוח" }).forEach(([name, value]) => data.set(name, value));
  data.append("receipts", new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: "image/png" }), "קבלה.png");
  return data;
}

test("offline save, lost acknowledgement, storage auth failures and reconnect preserve files without duplicates", async () => {
  const eventTarget = new EventTarget();
  Object.defineProperty(globalThis, "indexedDB", { value: indexedDB, configurable: true });
  Object.defineProperty(globalThis, "window", { value: { dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget), setTimeout, clearTimeout }, configurable: true });
  const network = { onLine: false };
  Object.defineProperty(globalThis, "navigator", { value: network, configurable: true });
  await store.saveSnapshot({ profile, categories: [], expenses: [], saved_at: "2026-10-02T10:00:00Z" });
  const realFetch = globalThis.fetch;
  const committed = new Map<string, unknown>(), uploads = new Set<string>();
  let loseAck = true, uploadAuthError = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!network.onLine) throw new TypeError("offline");
    if (url === "/api/offline/expenses" && !init?.method) return Response.json({ profile });
    if (url.includes("/storage/v1/object/receipts/")) {
      if (uploadAuthError) return Response.json({ statusCode: String(uploadAuthError) }, { status: uploadAuthError });
      assert.ok(init?.body instanceof Blob);
      const bytes = new Uint8Array(await (init.body as Blob).arrayBuffer());
      assert.equal(bytes[0], 137);
      if (uploads.has(url)) return Response.json({ statusCode: "409", message: "already exists" }, { status: 409 });
      uploads.add(url); return Response.json({});
    }
    const payload = JSON.parse(String(init?.body));
    const expense = { ...payload.fields, id: payload.expense_id, created_by: profile.id, updated_at: "2026-10-02T10:00:00Z" };
    committed.set(payload.operation_id, expense);
    if (loseAck) { loseAck = false; throw new TypeError("connection lost after commit"); }
    return Response.json({ expense });
  };
  type Sync = { queueExpense: (form: FormData) => Promise<string>; syncDrafts: (profile: OfflineProfile) => Promise<{ synced: number; connected: boolean; error?: string }> };
  const loadedModule = { exports: {} as Sync };
  const source = ts.transpileModule(readFileSync(new URL("../src/lib/offline-sync.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const localRequire = (name: string): unknown => {
    if (name === "./expenses") return { expenseSchema, receiptExtension };
    if (name === "./offline-store") return store;
    if (name === "./supabase/browser") return { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "test-token" } }, error: null }) } }) };
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(localRequire, loadedModule, loadedModule.exports);
  try {
    await loadedModule.exports.queueExpense(form());
    const initial = (await store.listDrafts(profile.id))[0];
    assert.equal(initial.files[0].name, "קבלה.png");
    assert.equal((await loadedModule.exports.syncDrafts(profile)).connected, false);
    assert.equal((await store.listDrafts(profile.id)).length, 1);
    network.onLine = true;
    assert.equal((await loadedModule.exports.syncDrafts(profile)).connected, false); // server committed, response lost
    assert.equal((await store.listDrafts(profile.id)).length, 1);
    assert.equal(committed.size, 1); assert.equal(uploads.size, 1);
    assert.equal((await loadedModule.exports.syncDrafts(profile)).synced, 1);
    assert.equal((await store.listDrafts(profile.id)).length, 0);
    assert.equal(committed.size, 1); assert.equal(uploads.size, 1);
    for (const code of [401, 403]) {
      uploadAuthError = code;
      const committedBefore: number = committed.size;
      await loadedModule.exports.queueExpense(form());
      const report = await loadedModule.exports.syncDrafts(profile);
      assert.equal(report.connected, true, "an auth rejection must not appear as lost connectivity");
      assert.equal(report.synced, 0);
      const [blocked] = await store.listDrafts(profile.id);
      assert.equal(blocked.error_code, code); assert.equal(blocked.blocked, true);
      assert.equal(blocked.files.length, 1); assert.equal(blocked.files[0].blob.size, 8);
      assert.equal(committed.size, committedBefore);
      const stillBlocked = await loadedModule.exports.syncDrafts(profile);
      assert.equal(stillBlocked.synced, 0, "blocked auth failures must not be retried indefinitely");
      uploadAuthError = 0;
      await store.putDraft({ ...blocked, blocked: false, error: undefined, error_code: undefined });
      assert.equal((await loadedModule.exports.syncDrafts(profile)).synced, 1);
      assert.equal((await store.listDrafts(profile.id)).length, 0);
      assert.equal(committed.size, committedBefore + 1);
    }
    await store.saveSnapshot({ profile: { ...profile, role: "read_only" }, categories: [], expenses: [], saved_at: "2026-10-02T11:00:00Z" });
    await assert.rejects(() => loadedModule.exports.queueExpense(form()), /אין הרשאה/);
    assert.equal((await store.listDrafts(profile.id)).length, 0);
  } finally { globalThis.fetch = realFetch; }
});
