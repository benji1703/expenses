import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import test from "node:test";

const require = createRequire(import.meta.url);
function setup(role = "admin", code = "") {
  let writes = 0;
  const row = { id: "75b8a7be-a44a-47ab-8520-01d786466243", name: "חשמל", color: "#9b8c7c" };
  const source = ts.transpileModule(readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} as { saveCategory: (state: object, form: FormData) => Promise<{ error?: string; category?: typeof row }> } };
  const query = {
    insert: (values: object) => { writes++; Object.assign(row, values); return query; },
    select: () => query, single: async () => ({ data: code ? null : row, error: code ? { code } : null }),
  };
  const localRequire = (name: string) => {
    if (name === "@/lib/auth") return { requireMember: async () => ({ member: { role } }) };
    if (name === "@/lib/supabase/admin") return { adminClient: () => ({ from: () => query }) };
    if (name === "next/cache") return { revalidatePath: () => {} };
    if (name.startsWith("@/")) return {};
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(localRequire, loaded, loaded.exports);
  const form = (name = "עבודות חשמל") => { const form = new FormData(); form.set("name", name); form.set("color", "#9b8c7c"); return form; };
  return { ...loaded.exports, form, row, writes: () => writes };
}

test("inline category creation returns the saved category for immediate selection", async () => {
  const app = setup();
  assert.deepEqual((await app.saveCategory({}, app.form())).category, app.row);
  assert.equal(app.writes(), 1);
});

test("inline category creation enforces fresh admin permission, validation and duplicate handling", async () => {
  for (const role of ["member", "read_only"]) {
    const app = setup(role); assert.ok((await app.saveCategory({}, app.form())).error); assert.equal(app.writes(), 0);
  }
  const app = setup(); assert.ok((await app.saveCategory({}, app.form(""))).error); assert.equal(app.writes(), 0);
  const duplicate = setup("admin", "23505"); const result = await duplicate.saveCategory({}, duplicate.form());
  assert.ok(result.error?.includes("כבר קיימת")); assert.equal(result.category, undefined);
});
