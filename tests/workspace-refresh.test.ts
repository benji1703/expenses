import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { workspaceRefresh, workspaceRoute } from "../src/lib/workspace-navigation.ts";

test("online and sync refreshes preserve open editors and never refresh the offline shell tree", () => {
  let offline = false, dialogOpen = false, cached = false, refreshed = 0;
  const windowEvents = new EventTarget(), documentEvents = new EventTarget();
  const refs: { current: unknown }[] = [];
  let cursor = 0, cleanup: (() => void) | undefined;
  const router = { refresh: () => { refreshed++; } };
  const loaded = { exports: {} as { WorkspaceMode: (props: { children: string }) => string } };
  const source = ts.transpileModule(readFileSync(new URL("../src/components/workspace-mode.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
    window: windowEvents,
    document: { addEventListener: documentEvents.addEventListener.bind(documentEvents), removeEventListener: documentEvents.removeEventListener.bind(documentEvents), querySelector: (selector: string) => selector === "dialog[open]" ? dialogOpen : cached },
  })((name: string) => {
    if (name === "react") return {
      useSyncExternalStore: () => offline,
      useRef: (value: unknown) => { const index = cursor++; return refs[index] ??= { current: value }; },
      useEffect: (effect: () => (() => void)) => { cleanup = effect(); },
    };
    if (name === "next/navigation") return { usePathname: () => "/expenses", useRouter: () => router };
    if (name === "@/lib/connection-state") return { isDisconnected: () => offline, subscribeConnection: () => {} };
    if (name === "@/lib/workspace-navigation") return { workspaceRefresh, workspaceRoute };
    throw new Error(name);
  }, loaded, loaded.exports);
  const render = () => { cleanup?.(); cursor = 0; assert.equal(loaded.exports.WorkspaceMode({ children: "editor with files" }), "editor with files"); };
  render();
  offline = true; render();
  dialogOpen = true;
  offline = false; render();
  assert.equal(refreshed, 0);
  dialogOpen = false;
  documentEvents.dispatchEvent(new Event("close"));
  assert.equal(refreshed, 1);
  dialogOpen = true;
  windowEvents.dispatchEvent(new Event(workspaceRefresh));
  assert.equal(refreshed, 1);
  dialogOpen = false;
  documentEvents.dispatchEvent(new Event("close"));
  assert.equal(refreshed, 2);
  cached = true;
  windowEvents.dispatchEvent(new Event(workspaceRefresh));
  assert.equal(refreshed, 2);
  offline = true; render(); offline = false; render();
  assert.equal(refreshed, 2);
  cleanup?.();
});
