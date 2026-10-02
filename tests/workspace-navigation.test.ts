import assert from "node:assert/strict";
import test from "node:test";
import { selectedNavigation, workspaceRoute } from "../src/lib/workspace-navigation.ts";

test("menu selection follows the requested route, including category details and filters", () => {
  assert.equal(selectedNavigation("/categories/123?month=2026-10", "/categories"), true);
  assert.equal(selectedNavigation("/expenses?q=test", "/categories"), false);
  assert.equal(selectedNavigation("/expenses?q=test", "/expenses"), true);
  assert.equal(workspaceRoute("/")?.icon, "overview");
  assert.equal(workspaceRoute("/categories/")?.label, "קטגוריות");
  for (const path of ["/login", "/auth/callback", "/api/offline/expenses", "/receipts/id", "/categories/id/unknown"]) assert.equal(workspaceRoute(path), undefined);
});
