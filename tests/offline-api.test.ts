import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { expenseSchema, receiptExtension } from "../src/lib/expenses.ts";
import { sameExpenseFields } from "../src/lib/offline-types.ts";
import { expenseReplaySchema } from "../src/lib/expense-replay.ts";

const require = createRequire(import.meta.url);
const owner = "aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa";
const id = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const category = "cccccccc-cccc-4ccc-bccc-cccccccccccc";
const attachment = "dddddddd-dddd-4ddd-bddd-dddddddddddd";
const filePath = `${owner}/${id}/${attachment}.png`;
const fields = { merchant: "אור חשמל", amount: "1180.00", currency: "ILS", payment_status: "paid", due_on: "", reference: "4821", stage: "construction", spent_on: "2026-10-02", category_id: category, notes: "התקנת לוח" };
type Row = Record<string, unknown>;
type Result = { data: Row | Row[] | null; error: { code: string; message: string } | null };
function setup() {
  const expenses = new Map<string, Row>(), receipts = new Map<string, Row>();
  const state = { role: "admin", failLinks: false, downloads: 0, mutations: 0, validFile: true, race: false, categoryFailure: false, categoryMissing: false };
  class Query {
    table: string; mode = "read"; filters = new Map<string, unknown>(); values: Row[] = []; singular = false;
    constructor(table: string) { this.table = table; }
    select() { return this; }
    eq(key: string, value: unknown) { this.filters.set(key, value); return this; }
    single() { this.singular = true; return this; }
    maybeSingle() { this.singular = true; return this; }
    insert(value: Row) { this.mode = "insert"; this.values = [value]; return this; }
    update(value: Row) { this.mode = "update"; this.values = [value]; return this; }
    upsert(value: Row[]) { this.mode = "upsert"; this.values = value; return this; }
    then(resolve: (result: Result) => unknown) {
      const ok = (data: Row | Row[] | null): Result => ({ data, error: null });
      const error = (code: string): Result => ({ data: null, error: { code, message: "simulated" } });
      let result: Result;
      if (this.table === "members") result = ok({ role: state.role });
      else if (this.table === "categories") result = state.categoryFailure ? error("503") : ok(state.categoryMissing ? null : { id: category });
      else {
        const table = this.table === "expenses" ? expenses : receipts;
        if (this.mode === "insert") {
          if (table.has(String(this.values[0].id))) result = error("23505");
          else { table.set(String(this.values[0].id), { ...this.values[0], updated_at: "2026-10-02T10:00:00Z" }); state.mutations++; result = ok(null); }
        } else if (this.mode === "upsert") {
          if (state.failLinks) { state.failLinks = false; result = error("503"); }
          else { this.values.forEach((value) => { if (!table.has(String(value.id))) table.set(String(value.id), { ...value }); }); state.mutations++; result = ok(null); }
        } else {
          if (state.race && this.mode === "update") { state.race = false; const row = table.get(id)!; table.set(id, { ...row, updated_at: "2026-10-02T12:00:00Z", notes: "concurrent edit" }); }
          const rows = [...table.values()].filter((row) => [...this.filters].every(([key, value]) => row[key] === value));
          if (this.mode === "update" && rows.length) {
            const row: Row = { ...rows[0], ...this.values[0], updated_at: "2026-10-02T11:00:00Z" }; table.set(String(row.id), row); state.mutations++; result = ok(row);
          } else result = ok(this.singular ? rows[0] ? { ...rows[0] } : null : rows);
        }
      }
      return Promise.resolve(result).then(resolve);
    }
  }
  const client = { auth: { getClaims: async () => ({ data: { claims: { sub: owner, email: "owner@example.com" } }, error: null }) }, from: (table: string) => new Query(table) };
  const loadedModule = { exports: {} as { POST: (request: Request) => Promise<Response>; GET: (request: Request) => Promise<Response> } };
  const source = ts.transpileModule(readFileSync(new URL("../src/app/api/offline/expenses/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const localRequire = (name: string): unknown => {
    if (name === "@/lib/supabase/server") return { createClient: async () => client };
    if (name === "@/lib/supabase/admin") return { adminClient: () => ({ storage: { from: () => ({ download: async () => { state.downloads++; return { data: new Blob([state.validFile ? new Uint8Array([137,80,78,71,13,10,26,10]) : "not an image"]), error: null }; } }) } }) };
    if (name === "@/lib/expenses") return { expenseSchema, receiptExtension };
    if (name === "@/lib/offline-types") return { sameExpenseFields };
    if (name === "@/lib/expense-replay") return { expenseReplaySchema };
    if (name === "next/cache") return { revalidatePath: () => {} };
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(localRequire, loadedModule, loadedModule.exports);
  const payload = { owner, operation_id: id, expense_id: id, editing: false, expected_updated_at: null as string | null, fields, files: [{ id: attachment, path: filePath, type: "image/png" }] };
  const post = (body = payload, origin = "https://expenses.example.com") => loadedModule.exports.POST(new Request("https://expenses.example.com/api/offline/expenses", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) }));
  const get = (params = "") => loadedModule.exports.GET(new Request(`https://expenses.example.com/api/offline/expenses${params}`));
  return { state, expenses, receipts, payload, post, get };
}

test("offline API replay creates exactly one expense and one receipt", async () => {
  const s = setup();
  assert.equal((await s.post()).status, 200);
  assert.equal((await s.post()).status, 200);
  assert.equal(s.expenses.size, 1); assert.equal(s.receipts.size, 1); assert.equal(s.state.downloads, 1);
});
test("partial attachment-link failure recovers without deleting saved data", async () => {
  const s = setup(); s.state.failLinks = true;
  assert.equal((await s.post()).status, 503);
  assert.equal(s.expenses.size, 1); assert.equal(s.receipts.size, 0);
  assert.equal((await s.post()).status, 200);
  assert.equal(s.expenses.size, 1); assert.equal(s.receipts.size, 1);
});
test("newer remote edit blocks a stale draft before files or fields change", async () => {
  const s = setup(); await s.post();
  s.expenses.set(id, { ...s.expenses.get(id), notes: "remote edit", updated_at: "2026-10-02T12:00:00Z" });
  const before = s.state.mutations;
  assert.equal((await s.post({ ...s.payload, editing: true, expected_updated_at: "2026-10-02T10:00:00Z" })).status, 409);
  assert.equal(s.expenses.get(id)?.notes, "remote edit"); assert.equal(s.state.mutations, before);
});
test("fresh read-only access and cross-origin requests cannot mutate data", async () => {
  const s = setup(); s.state.role = "read_only";
  assert.equal((await s.post()).status, 403);
  s.state.role = "admin";
  assert.equal((await s.post(s.payload, "https://other.example.com")).status, 403);
  assert.equal(s.state.mutations, 0); assert.equal(s.state.downloads, 0);
});
test("read-only members can restore their cached workspace without access to writes or conflict editing", async () => {
  const s = setup(); s.state.role = "read_only";
  const identity = await s.get();
  assert.equal(identity.status, 200);
  assert.deepEqual(await identity.json(), { profile: { id: owner, role: "read_only" } });
  assert.equal((await s.get(`?expense_id=${id}`)).status, 403);
  assert.equal((await s.post()).status, 403);
  assert.equal(s.state.mutations, 0); assert.equal(s.state.downloads, 0);
});
test("foreign attachment paths and invalid image signatures are rejected", async () => {
  const s = setup();
  assert.equal((await s.post({ ...s.payload, files: [{ ...s.payload.files[0], path: "another-owner/receipt.png" }] })).status, 400);
  assert.equal(s.state.downloads, 0);
  s.state.validFile = false;
  assert.equal((await s.post()).status, 400);
  assert.equal(s.expenses.size, 0);
});
test("duplicate attachments and invalid replay values are rejected before uploads or writes", async () => {
  const s = setup();
  for (const payload of [
    { ...s.payload, files: [s.payload.files[0], s.payload.files[0]] },
    { ...s.payload, operation_id: "not-a-uuid" },
    { ...s.payload, fields: { ...fields, due_on: "2026-02-30" } },
    { ...s.payload, fields: { ...fields, amount: "1,180.00" } },
    { ...s.payload, fields: { ...fields, notes: "x".repeat(2001) } },
  ]) assert.equal((await s.post(payload)).status, 400);
  assert.equal(s.state.downloads, 0); assert.equal(s.state.mutations, 0);
});
test("optimistic version check rejects an edit racing with another device", async () => {
  const s = setup(); await s.post(); s.state.race = true;
  assert.equal((await s.post({ ...s.payload, editing: true, expected_updated_at: "2026-10-02T10:00:00Z", fields: { ...fields, notes: "offline edit" } })).status, 409);
  assert.equal(s.expenses.get(id)?.notes, "concurrent edit");
});

test("switching accounts never replays another owner's draft", async () => {
  const s = setup();
  assert.equal((await s.post({ ...s.payload, owner: "eeeeeeee-eeee-4eee-beee-eeeeeeeeeeee" })).status, 403);
  assert.equal(s.state.mutations, 0);
});

test("a transient category lookup failure stays retryable and cannot mutate an expense", async () => {
  const s = setup(); s.state.categoryFailure = true;
  assert.equal((await s.post()).status, 503);
  assert.equal(s.state.mutations, 0); assert.equal(s.state.downloads, 0);
  s.state.categoryFailure = false;
  assert.equal((await s.post()).status, 200);
  assert.equal(s.expenses.size, 1); assert.equal(s.receipts.size, 1);
});

test("an actually missing category requires repair instead of retrying indefinitely", async () => {
  const s = setup(); s.state.categoryMissing = true;
  assert.equal((await s.post()).status, 400);
  assert.equal(s.state.mutations, 0); assert.equal(s.state.downloads, 0);
});
