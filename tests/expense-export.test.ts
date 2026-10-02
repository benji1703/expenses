import { test } from "node:test";
import assert from "node:assert/strict";
import { requestExpenseExport } from "../src/lib/expense-export.ts";

test("export rejects reversed date ranges before requesting data", async () => {
  let requested = false;
  await assert.rejects(requestExpenseExport(new URLSearchParams({ from: "2026-10-02", to: "2026-10-01" }), async () => {
    requested = true;
    return new Response();
  }), /תאריך ההתחלה/);
  assert.equal(requested, false);
});

test("export preserves API errors and rejects a login page instead of downloading HTML", async () => {
  for (const status of [401, 403, 503]) {
    await assert.rejects(requestExpenseExport(new URLSearchParams(), async () => Response.json({ error: "שגיאת יצוא" }, { status })), /שגיאת יצוא/);
  }
  await assert.rejects(requestExpenseExport(new URLSearchParams(), async () => new Response("<html>Login</html>", { headers: { "Content-Type": "text/html; charset=utf-8" } })), /להיכנס מחדש/);
  await assert.rejects(requestExpenseExport(new URLSearchParams(), async () => { throw new TypeError("Failed to fetch"); }), /בדקו את החיבור/);
});

test("export forwards all filters and keeps the server's date range filename", async () => {
  const filters = { format: "csv", from: "2026-10-01", to: "2026-10-31", category: "category", q: "חשמל", status: "paid", stage: "construction", currency: "ILS" };
  const filename = "meshek-48-expenses-2026-10-01_to_2026-10-31.csv";
  const result = await requestExpenseExport(new URLSearchParams(filters), async (input, init) => {
    const url = new URL(String(input), "https://expenses.arbibe.dev");
    assert.deepEqual(Object.fromEntries(url.searchParams), filters);
    assert.equal(init?.cache, "no-store");
    return new Response("supplier,amount", { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` } });
  });
  assert.equal(result.filename, filename);
  assert.equal(await result.blob.text(), "supplier,amount");
});

test("export falls back to Meshek filename when filename metadata is malformed", async () => {
  for (const filename of ["%QQ", "..%2Foutside.json"]) {
    const result = await requestExpenseExport(new URLSearchParams({ format: "json" }), async () => new Response("[]", { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename*=UTF-8''${filename}` } }));
    assert.equal(result.filename, "meshek-48-expenses.json");
  }
});
