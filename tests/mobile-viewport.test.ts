import assert from "node:assert/strict";
import test from "node:test";
import { MobileViewportController } from "../src/lib/mobile-viewport.ts";

function device() {
  const properties = new Map<string, string>();
  const root = { clientHeight: 844, dataset: {} as Record<string, string>, style: {
    setProperty: (key: string, value: string) => properties.set(key, value), removeProperty: (key: string) => properties.delete(key),
  } };
  const viewport = Object.assign(new EventTarget(), { height: 500, offsetTop: 32, scale: 1 });
  let editable = true, coarse = true, queued: (() => void) | undefined;
  const document = Object.assign(new EventTarget(), { documentElement: root, activeElement: { matches: () => editable } });
  const view = Object.assign(new EventTarget(), { visualViewport: viewport, innerHeight: 844,
    matchMedia: () => ({ matches: coarse }), requestAnimationFrame: (callback: () => void) => { queued = callback; return 1; }, cancelAnimationFrame: () => { queued = undefined; },
  });
  const controller = new MobileViewportController(view as unknown as Window, document as unknown as Document);
  return { controller, root, properties, viewport, document, flush: () => { const callback = queued; queued = undefined; callback?.(); },
    editable: (value: boolean) => { editable = value; }, coarse: (value: boolean) => { coarse = value; } };
}

test("an iPhone keyboard constrains the editor to the visible viewport and closing restores normal layout", () => {
  const app = device(); app.controller.start(); app.controller.start();
  assert.equal(app.root.dataset.keyboard, "open");
  assert.equal(app.properties.get("--keyboard-viewport-height"), "500px");
  assert.equal(app.properties.get("--keyboard-viewport-top"), "32px");
  app.viewport.height = 844; app.viewport.dispatchEvent(new Event("resize")); app.flush();
  assert.equal(app.root.dataset.keyboard, undefined);
  assert.equal(app.properties.size, 0);
  app.controller.dispose();
});

test("pinch zoom, browser bars, hardware keyboards and desktop input do not hide navigation", () => {
  for (const mode of ["zoom", "bars", "blur", "desktop"]) {
    const app = device();
    if (mode === "zoom") app.viewport.scale = 1.5;
    if (mode === "bars") app.viewport.height = 760;
    if (mode === "blur") app.editable(false);
    if (mode === "desktop") app.coarse(false);
    app.controller.start();
    assert.equal(app.root.dataset.keyboard, undefined, mode);
    app.controller.dispose();
  }
});

test("leaving the page removes listeners and a queued keyboard update", () => {
  const app = device(); app.controller.start();
  app.viewport.dispatchEvent(new Event("scroll"));
  app.controller.dispose(); app.flush();
  assert.equal(app.properties.size, 0);
  app.document.dispatchEvent(new Event("focusin")); app.viewport.dispatchEvent(new Event("resize")); app.flush();
  assert.equal(app.root.dataset.keyboard, undefined);
  app.controller.start(); assert.equal(app.root.dataset.keyboard, "open"); app.controller.dispose();
});
