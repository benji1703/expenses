import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

function setup() {
  const state = {
    claims: { sub: "owner", email: "Owner@Example.com" } as { sub?: string; email?: string },
    authError: null as Error | null,
    member: { email: "owner@example.com", role: "read_only" } as object | null,
    memberError: null as { code: string } | null,
    lookups: 0,
    filters: [] as [string, unknown][],
  };
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { state.filters.push([key, value]); return query; },
    single: async () => ({ data: state.member, error: state.memberError }),
  };
  const client = {
    auth: { getClaims: async () => ({ data: { claims: state.claims }, error: state.authError }) },
    from: (table: string) => { assert.equal(table, "members"); state.lookups++; return query; },
  };
  const loaded = { exports: {} as { requireMember: () => Promise<{ member: object; user: { email: string } }> } };
  const source = ts.transpileModule(readFileSync(new URL("../src/lib/auth.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)((name: string) => {
    if (name === "server-only") return {};
    if (name === "react") return { cache: (fn: unknown) => fn };
    if (name === "next/navigation") return { redirect: (path: string) => { throw new Error(`redirect:${path}`); } };
    if (name === "./supabase/server") return { createClient: async () => client };
    throw new Error(name);
  }, loaded, loaded.exports);
  return { state, ...loaded.exports };
}

test("membership checks use current active access and normalize the email", async () => {
  const app = setup();
  assert.equal((await app.requireMember()).member, app.state.member);
  assert.deepEqual(app.state.filters, [["email", "owner@example.com"], ["active", true]]);
});

test("signed-out and missing-claim sessions redirect before reading membership", async () => {
  for (const invalid of [{ sub: "owner" }, { email: "owner@example.com" }]) {
    const app = setup(); app.state.claims = invalid;
    await assert.rejects(app.requireMember(), /redirect:\/login$/);
    assert.equal(app.state.lookups, 0);
  }
  const app = setup(); app.state.authError = new Error("invalid session");
  await assert.rejects(app.requireMember(), /redirect:\/login$/);
  assert.equal(app.state.lookups, 0);
});

test("missing or revoked membership denies access; service failures remain retryable", async () => {
  const app = setup(); app.state.member = null;
  await assert.rejects(app.requireMember(), /redirect:\/login\?error=access/);
  app.state.memberError = { code: "PGRST116" };
  await assert.rejects(app.requireMember(), /redirect:\/login\?error=access/);
  for (const code of ["503", "PGRST000", "57014"]) {
    app.state.memberError = { code };
    await assert.rejects(app.requireMember(), /Membership service unavailable/);
  }
});
