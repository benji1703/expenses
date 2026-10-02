import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

test("offline worker caches public shell/assets, never private pages or API responses", async () => {
  const handlers = new Map<string, (event: { request?: unknown; data?: unknown; respondWith: (response: Promise<Response>) => void; waitUntil: (promise: Promise<unknown>) => void }) => void>();
  const stored = new Map<string, Response>();
  const origin = "https://expenses.example.com";
  const key = (request: string | { url: string }) => new URL(typeof request === "string" ? request : request.url, origin).href;
  let connected = true;
  const fetch = async (request: string | { url: string }) => {
    if (!connected) throw new TypeError("offline");
    return new Response(key(request).endsWith("/offline") ? '<script src="/_next/static/test.js"></script><link href="/_next/static/test.css"/>' : "private or asset");
  };
  vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    URL, Response, fetch, caches: { open: async () => ({ match: async (request: string | { url: string }) => stored.get(key(request))?.clone(), put: async (request: string | { url: string }, response: Response) => stored.set(key(request), response) }) },
    self: { location: { origin }, clients: { claim: async () => {}, matchAll: async () => [] }, skipWaiting: async () => {}, addEventListener: (name: string, handler: typeof handlers extends Map<string, infer H> ? H : never) => handlers.set(name, handler) },
  });
  const waiting: Promise<unknown>[] = [];
  handlers.get("install")!({ respondWith: () => {}, waitUntil: (promise) => waiting.push(promise) });
  await Promise.all(waiting);
  assert.ok(stored.has(origin + "/offline"));
  assert.ok(stored.has(origin + "/_next/static/test.js"));
  const cached: Promise<unknown>[] = [];
  handlers.get("message")!({ data: { type: "CACHE_ASSETS", urls: [origin + "/_next/static/editor.js", origin + "/api/offline/expenses", "https://other.example.com/_next/static/test.js"] }, respondWith: () => {}, waitUntil: (promise) => cached.push(promise) });
  await Promise.all(cached);
  assert.ok(stored.has(origin + "/_next/static/editor.js"));
  assert.equal(stored.has(origin + "/api/offline/expenses"), false);
  assert.equal(stored.has("https://other.example.com/_next/static/test.js"), false);
  async function request(path: string, mode: string, method = "GET") {
    let response: Promise<Response> | undefined;
    handlers.get("fetch")!({ request: { url: origin + path, mode, method }, respondWith: (promise) => { response = promise; }, waitUntil: () => {} });
    return response ? await response : undefined;
  }
  await request("/expenses", "navigate");
  assert.equal(stored.has(origin + "/expenses"), false);
  assert.equal(await request("/expenses?_rsc=test", "cors"), undefined);
  assert.equal(await request("/api/offline/expenses", "cors", "POST"), undefined);
  assert.equal(await request("/login", "navigate"), undefined);
  connected = false;
  for (const path of ["/", "/expenses?month=2026-10&q=test", "/categories", "/categories/example", "/account", "/household"]) {
    const response = await request(path, "navigate");
    assert.equal(response?.status, 200);
    assert.equal(response?.headers.get("location"), null);
    assert.equal(response?.url, ""); // Original route remains the response/navigation URL.
    assert.match(await response!.text(), /test.js/);
    assert.equal(stored.has(origin + path), false);
  }
  assert.equal(await (await request("/_next/static/test.js", "cors"))!.text(), "private or asset");
  stored.delete(origin + "/offline");
  assert.equal((await request("/offline", "navigate"))?.status, 503);
});
