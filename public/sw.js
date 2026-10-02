/* Cache only the public offline shell/assets. Authenticated HTML, RSC, auth and API responses never enter this cache. */
const CACHE = "meshek48-shell-v1";
const ASSETS = /^\/(?:_next\/static\/|fonts\/|tesseract\/|pdfjs\/|design\/|icons\/)/;
const WORKSPACE = /^\/(?:$|expenses\/?$|categories(?:\/[^/]+)?\/?$|guide\/?$|account\/?$|household\/?$)/;
let preparing;
function prepare() {
  if (preparing) return preparing;
  preparing = prepareShell().finally(() => { preparing = undefined; });
  return preparing;
}
async function prepareShell() {
  const cache = await caches.open(CACHE);
  const response = await fetch("/offline", { cache: "no-store" });
  if (!response.ok || response.redirected) return;
  const html = await response.clone().text();
  const urls = [...new Set([...html.matchAll(/(?:src|href)="([^"<>]+)"/g)].map((match) => match[1]).filter((url) => ASSETS.test(url)))];
  // Fonts are used from CSS, outside the HTML script/style list.
  urls.push("/fonts/heebo-hebrew.woff2", "/fonts/heebo-latin.woff2");
  await cacheAssets(urls);
  await cache.put("/offline", response);
}
async function cacheAssets(urls) {
  const cache = await caches.open(CACHE);
  await Promise.all(urls.map(async (value) => {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin || !ASSETS.test(url.pathname) || await cache.match(url.href)) return;
    const response = await fetch(url.href);
    if (!response.ok) throw new Error("Offline asset unavailable");
    await cache.put(url.href, response);
  }));
}
self.addEventListener("install", (event) => { event.waitUntil(prepare().then(() => self.skipWaiting())); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener("message", (event) => {
  if (event.data?.type === "PREPARE_OFFLINE") event.waitUntil(prepare().catch(() => {}));
  if (event.data?.type === "CACHE_ASSETS" && Array.isArray(event.data.urls)) {
    event.waitUntil(cacheAssets(event.data.urls).then(async () => {
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((client) => client.postMessage({ type: "OFFLINE_READY" }));
    }).catch(() => {}));
  }
  // The cache contains no private data; sign-out clears the active IndexedDB profile in the app.
});
self.addEventListener("fetch", (event) => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (ASSETS.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  } else if (request.mode === "navigate" && (WORKSPACE.test(url.pathname) || url.pathname === "/offline")) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.status < 500) return response;
      } catch { /* Show a local workspace on connection loss. */ }
      if (url.pathname !== "/offline") {
        const view = url.pathname.startsWith("/categories") ? "categories" : url.pathname === "/" ? "overview" : url.pathname.slice(1);
        return Response.redirect(new URL("/offline?view=" + encodeURIComponent(view), self.location.origin), 302);
      }
      return (await (await caches.open(CACHE)).match("/offline")) ?? new Response("Offline workspace is not ready. Reconnect and open the app once.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    })());
  }
});
