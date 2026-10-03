import assert from "node:assert/strict";
import test from "node:test";
import { ledgerFilters } from "../src/lib/ledger-filters.ts";

const category = "cccccccc-cccc-4ccc-bccc-cccccccccccc";
test("ledger filters validate UUIDs, months, page bounds and repeated query values", () => {
  assert.deepEqual(ledgerFilters({ month: "2026-10", category, q: "  חשמל  ", page: "2.9" }), { month: "2026-10", categoryId: category, search: "חשמל", page: 2 });
  for (const month of ["2026-13", "2026-00", "1999-12", "2101-01", "2026-1", "2026-10-01"]) assert.equal(ledgerFilters({ month }).month, "");
  for (const invalid of ["------------------------------------", "not-a-uuid", [category]]) assert.equal(ledgerFilters({ category: invalid }).categoryId, "");
  assert.equal(ledgerFilters({ month: ["2026-10"], q: ["חשמל"] }).search, "");
  assert.equal(ledgerFilters({ page: "-100" }).page, 1);
  assert.equal(ledgerFilters({ page: "100000" }).page, 10000);
  assert.equal(ledgerFilters({ page: "bad" }).page, 1);
  assert.equal(ledgerFilters({ q: "x".repeat(200) }).search.length, 100);
  assert.deepEqual(ledgerFilters(new URLSearchParams(`month=2026-10&category=${category}&q=+חשמל+&page=2.9`)), ledgerFilters({ month: "2026-10", category, q: "  חשמל  ", page: "2.9" }));
  assert.equal(ledgerFilters(new URLSearchParams("q=first&q=second&month=2026-10&month=2026-11")).search, "");
  assert.equal(ledgerFilters(new URLSearchParams("month=2026-10&month=2026-11")).month, "");
});

test("a category route takes precedence over the filter query", () => {
  assert.equal(ledgerFilters({ category: "aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa" }, category).categoryId, category);
  assert.equal(ledgerFilters({ category }, "invalid").categoryId, "");
});
