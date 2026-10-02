import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import test from "node:test";
import { accessGroup, type AccessMember } from "../src/lib/access.ts";

const require = createRequire(import.meta.url);
type Row = { email: string; role: string; active: boolean; created_at: string };
function setup() {
  const self = "admin@example.com", other = "other@example.com";
  const rows = new Map<string, Row>([[self, { email: self, role: "admin", active: true, created_at: "2026-10-02" }], [other, { email: other, role: "admin", active: true, created_at: "2026-10-02" }]]);
  const state = { role: "admin", writes: 0, emails: 0, failMail: false, confirmed: true, magicLinks: 0 };
  class Query {
    mode = "read"; values: Partial<Row> = {}; equals = new Map<string, unknown>(); not = new Map<string, unknown>();
    select() { return this; } eq(key: string, value: unknown) { this.equals.set(key, value); return this; }
    neq(key: string, value: unknown) { this.not.set(key, value); return this; } single() { return this; } maybeSingle() { return this; }
    update(values: Partial<Row>) { this.mode = "update"; this.values = values; return this; }
    insert(values: Partial<Row>) { this.mode = "insert"; this.values = values; return this; }
    delete() { this.mode = "delete"; return this; }
    then(resolve: (value: unknown) => unknown) {
      const matches = [...rows.values()].filter(row => [...this.equals].every(([key,value]) => row[key as keyof Row] === value) && [...this.not].every(([key,value]) => row[key as keyof Row] !== value));
      let data: Row | null = matches[0] ?? null, error: unknown = null;
      if (this.mode === "insert") {
        if (rows.has(this.values.email!)) error = { code: "23505" };
        else { data = { ...this.values, created_at: "new-invitation" } as Row; rows.set(data.email, data); state.writes++; }
      } else if (this.mode === "update" && data) { data = { ...data, ...this.values }; rows.set(data.email,data); state.writes++; }
      else if (this.mode === "delete") matches.forEach(row => { rows.delete(row.email); state.writes++; });
      return Promise.resolve({ data, error }).then(resolve);
    }
  }
  const send = async () => { state.emails++; return { error: state.failMail ? new Error("SMTP failed") : null }; };
  type Action = (previous: object, form: FormData) => Promise<{ error?: string; success?: string }>;
  const loadedModule = { exports: {} as { inviteMember: Action; resendMemberInvitation: Action; updateMemberAccess: Action } };
  const source = ts.transpileModule(readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  function localRequire(name: string): unknown {
    if (name === "@/lib/auth") return { requireMember: async () => ({ member: { email: self, role: state.role } }) };
    if (name === "@/lib/supabase/admin") return { adminClient: () => ({ from: () => new Query(), auth: { admin: { inviteUserByEmail: send } } }) };
    if (name === "@/lib/supabase/server") return { createClient: async () => ({ auth: { signInWithOtp: async (_params: { options: { shouldCreateUser: boolean } }) => { assert.equal(_params.options.shouldCreateUser,false); state.magicLinks++; return send(); } } }) };
    if (name === "@/lib/access-server") return { authStatusFor: async (emails: string[]) => new Map(emails.map(email => [email, { email_confirmed_at: state.confirmed ? "confirmed" : undefined }])) };
    if (name === "next/cache") return { revalidatePath: () => {} };
    if (name === "next/headers") return { headers: async () => new Headers() };
    if (name === "next/navigation") return { redirect: () => { throw Error("unexpected redirect"); } };
    if (name.startsWith("@/")) return {};
    return require(name);
  }
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(localRequire, loadedModule, loadedModule.exports);
  const form = (email = other, role = "member", active = "true") => { const fields = new FormData(); fields.set("email",email); fields.set("role",role); fields.set("active",active); return fields; };
  return { ...loadedModule.exports, state, rows, form, self, other };
}

test("access groups separate pending invitations from admins and revoked users", () => {
  const row: AccessMember = { email: "person@example.com", role: "admin", active: true, created_at: "2026-10-02", last_sign_in_at: null, invited_at: null, status: "pending" };
  assert.equal(accessGroup(row),"invited");
  assert.equal(accessGroup({ ...row, status:"active" }),"admins");
  assert.equal(accessGroup({ ...row, role:"read_only", status:"active" }),"members");
  assert.equal(accessGroup({ ...row, active:false }),"revoked");
  assert.equal(accessGroup({ ...row, role:"member", status:"unknown" }),"members");
});
test("admins can edit another admin's role and revoke or restore access atomically", async () => {
  const app = setup();
  assert.ok((await app.updateMemberAccess({},app.form(app.other,"read_only","false"))).success);
  assert.equal(app.rows.get(app.other)?.role,"read_only"); assert.equal(app.rows.get(app.other)?.active,false);
  assert.equal(app.state.writes,1); assert.equal(app.state.emails,0);
  assert.ok((await app.updateMemberAccess({},app.form(app.other,"admin","true"))).success);
  assert.equal(app.rows.get(app.other)?.role,"admin"); assert.equal(app.rows.get(app.other)?.active,true);
});
test("self edits, invalid input, missing users, and non-admins never report successful mutations", async () => {
  const app = setup();
  assert.ok((await app.updateMemberAccess({},app.form(app.self))).error);
  assert.ok((await app.updateMemberAccess({},app.form(app.other,"owner"))).error);
  assert.ok((await app.updateMemberAccess({},app.form(app.other,"member","invalid"))).error);
  assert.ok((await app.updateMemberAccess({},app.form("missing@example.com"))).error);
  app.state.role="read_only";
  for (const action of [app.updateMemberAccess,app.inviteMember,app.resendMemberInvitation]) assert.ok((await action({},app.form())).error);
  assert.equal(app.state.writes,0); assert.equal(app.state.emails,0);
});
test("resending uses current active membership without modifying role or access", async () => {
  const app = setup();
  assert.ok((await app.resendMemberInvitation({},app.form(app.other,"read_only","false"))).success);
  assert.equal(app.rows.get(app.other)?.role,"admin"); assert.equal(app.state.writes,0); assert.equal(app.state.magicLinks,1);
  app.rows.get(app.other)!.active=false;
  assert.ok((await app.resendMemberInvitation({},app.form())).error);
  assert.equal(app.state.emails,1);
});
test("new invitations cannot silently change existing roles; delivery failure rolls back the new membership", async () => {
  const app = setup();
  assert.ok((await app.inviteMember({},app.form())).error); assert.equal(app.state.writes,0);
  app.state.confirmed=false; app.state.failMail=true;
  assert.ok((await app.inviteMember({},app.form("new@example.com","read_only"))).error);
  assert.equal(app.rows.has("new@example.com"),false); assert.equal(app.rows.get(app.other)?.role,"admin");
  app.state.failMail=false;
  assert.ok((await app.inviteMember({},app.form("new@example.com","read_only"))).success);
  assert.equal(app.rows.get("new@example.com")?.role,"read_only"); assert.equal(app.state.magicLinks,0);
});
