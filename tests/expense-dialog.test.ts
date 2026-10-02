import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import test from "node:test";
import { outsideDialog } from "../src/lib/dialog-dismiss.ts";

const require = createRequire(import.meta.url);
type Element = { type: unknown; props: { children?: Element | Element[]; onCancel?: (event: unknown) => void } };
function find(tree: Element, type: string): Element | undefined {
  if (tree?.type === type) return tree;
  const children = tree?.props?.children;
  for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) {
    if (child && typeof child === "object") { const match = find(child as Element, type); if (match) return match; }
  }
}

test("native picker cancellation never closes the expense modal; dialog Escape still closes it", () => {
  let closes = 0, prevented = 0;
  const dialog = { close: () => { closes++; } };
  const loaded = { exports: {} as { ExpenseForm: (props: object) => Element } };
  const source = ts.transpileModule(readFileSync(new URL("../src/components/expense-form.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const localRequire = (name: string) => {
    if (name === "react") return { useState: (value: unknown) => [value, () => {}], useRef: (value: unknown) => ({ current: value === null ? dialog : value }), useEffect: () => {}, useCallback: (fn: unknown) => fn };
    if (name === "@/lib/dialog-dismiss") return { outsideDialog };
    if (name === "@/components/expense-fields") return { default: () => null };
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(localRequire, loaded, loaded.exports);
  const element = find(loaded.exports.ExpenseForm({ categories: [] }), "dialog")!;
  element.props.onCancel!({ target: { type: "file" }, currentTarget: dialog, preventDefault: () => { prevented++; } });
  assert.equal(closes, 0); assert.equal(prevented, 0);
  element.props.onCancel!({ target: dialog, currentTarget: dialog, preventDefault: () => { prevented++; } });
  assert.equal(closes, 1); assert.equal(prevented, 1);
});
