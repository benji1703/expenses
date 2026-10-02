import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import JSZip from "jszip";
import { paymentStatuses, stages } from "../src/lib/renovation-guide.ts";

const require = createRequire(import.meta.url);
const category = "cccccccc-cccc-4ccc-bccc-cccccccccccc";
type Row = Record<string, unknown>;
function setup(length = 1) {
  const expenses = Array.from({ length }, (_, index) => ({
    id: String(index).padStart(8, "0") + "-aaaa-4aaa-baaa-aaaaaaaaaaaa",
    category_id: category, merchant: `ספק ${index}`, amount: 1180,
    currency: "ILS", spent_on: "2026-10-02", due_on: null, reference: "48",
    payment_status: "paid", stage: "construction", notes: "", receipt_path: null,
    created_at: "2026-10-02T10:00:00Z", updated_at: "2026-10-02T10:00:00Z",
    expense_receipts: [{ count: 10 }],
  }));
  const state = { authorized: true, member: true, memberError: false, expenseError: false,
    queries: [] as string[], orders: [] as string[], ranges: [] as number[][],
    selections: [] as string[], filters: [] as [string, string, unknown][] };
  class Query {
    table: string;
    constructor(table: string) { this.table = table; state.queries.push(table); }
    start = 0; end = 999;
    select(columns: string) { if (this.table === "expenses") state.selections.push(columns); return this; }
    order(key: string) { state.orders.push(key); return this; }
    eq(key: string, value: unknown) { state.filters.push(["eq", key, value]); return this; }
    gte(key: string, value: unknown) { state.filters.push(["gte", key, value]); return this; }
    lte(key: string, value: unknown) { state.filters.push(["lte", key, value]); return this; }
    ilike(key: string, value: unknown) { state.filters.push(["ilike", key, value]); return this; }
    maybeSingle() { return this; }
    range(start: number, end: number) { this.start = start; this.end = end; state.ranges.push([start, end]); return this; }
    then(resolve: (result: { data: Row | Row[] | null; error: { code: string } | null }) => unknown) {
      if (this.table === "members") return Promise.resolve({ data: state.member ? { email: "reader@example.com", active: true } : null,
        error: state.memberError ? { code: "503" } : null }).then(resolve);
      if (this.table === "categories") return Promise.resolve({ data: [{ id: category, name: "חשמל" }], error: null }).then(resolve);
      assert.equal(this.table, "expenses", "receipt rows must not be fetched separately");
      return Promise.resolve({ data: expenses.slice(this.start, this.end + 1), error: state.expenseError ? { code: "503" } : null }).then(resolve);
    }
  }
  const client = { auth: { getClaims: async () => ({ data: state.authorized
    ? { claims: { sub: "aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa", email: "reader@example.com" } } : null, error: null }) },
    from: (table: string) => new Query(table) };
  const loaded = { exports: {} as { GET: (request: Request) => Promise<Response> } };
  const source = ts.transpileModule(readFileSync(new URL("../src/app/api/exports/expenses/route.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const localRequire = (name: string): unknown => {
    if (name === "@/lib/supabase/server") return { createClient: async () => client };
    if (name === "@/lib/renovation-guide") return { paymentStatuses, stages };
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(localRequire, loaded, loaded.exports);
  return { state, expenses, get: (params = "format=json") => loaded.exports.GET(new Request(`https://expenses.example.com/api/exports/expenses?${params}`)) };
}

test("exports retain all attachment flags beyond the Supabase receipt-row cap without receipt requests", async () => {
  const s = setup(1005);
  const response = await s.get();
  assert.equal(response.status, 200);
  const rows = await response.json() as Row[];
  assert.equal(rows.length, 1005);
  assert.ok(rows.every((row) => row.receipt_attached === true));
  assert.deepEqual(s.state.ranges, [[0, 999], [1000, 1999]]);
  assert.deepEqual(s.state.orders, ["spent_on", "created_at", "id"]);
  assert.equal(s.state.selections[0], "*,expense_receipts(count)");
  assert.ok(!s.state.queries.includes("expense_receipts"));
  assert.match(response.headers.get("Content-Disposition")!, /meshek-48-expenses/);
  assert.match(response.headers.get("Cache-Control")!, /no-store/);
});

test("export blocks missing auth and revoked access, but retries membership service failures", async () => {
  const s = setup(); s.state.authorized = false;
  assert.equal((await s.get()).status, 401); assert.equal(s.state.queries.length, 0);
  s.state.authorized = true; s.state.member = false;
  assert.equal((await s.get()).status, 403);
  s.state.memberError = true;
  assert.equal((await s.get()).status, 503);
  assert.ok(!s.state.queries.includes("expenses"));
});

test("export validates dates and filters before querying the ledger", async () => {
  const s = setup();
  assert.equal((await s.get("format=json&from=2026-10-02&to=2026-10-01")).status, 400);
  assert.equal((await s.get("format=html")).status, 400);
  assert.ok(!s.state.queries.includes("expenses"));
  const response = await s.get(`format=json&category=${category}&status=paid&from=2026-10-01&q=50%25_off`);
  assert.equal(response.status, 200);
  assert.ok(s.state.filters.some(([operation, key, value]) => operation === "ilike" && key === "merchant" && value === "%50\\%\\_off%"));
});

test("CSV neutralizes spreadsheet formulas and preserves Hebrew while XLSX stores text safely", async () => {
  const s = setup(); s.expenses[0].merchant = '=HYPERLINK("https://example.invalid")';
  s.expenses[0].notes = "התקנת חשמל";
  const csv = await (await s.get("format=csv")).text();
  assert.match(csv, /'=HYPERLINK/); assert.match(csv, /התקנת חשמל/);
  const response = await s.get("format=xlsx");
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  assert.match(xml, /rightToLeft="1"/); assert.match(xml, /התקנת חשמל/);
  assert.match(xml, /t="inlineStr".*?=HYPERLINK/); assert.ok(!xml.includes("<f>"));
});
