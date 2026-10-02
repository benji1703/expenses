import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import test from "node:test";
import { documentTypes, extractReceiptFields } from "../src/lib/receipt-ocr.ts";

const require = createRequire(import.meta.url);
type Element = { type: unknown; props: { children?: unknown; type?: string; disabled?: boolean; role?: string; "aria-label"?: string; onClick?: () => void } };
function elements(tree: unknown): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const element = tree as Element;
  return [element, ...elements(element.props.children)];
}
function review() {
  let state = "";
  const loaded = { exports: {} as { ReceiptReview: (props: object) => Element } };
  const source = ts.transpileModule(readFileSync(new URL("../src/components/receipt-review.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const localRequire = (name: string) => {
    if (name === "react") return { useState: () => [state, (next: string) => { state = next; }] };
    if (name === "@/lib/receipt-ocr") return { documentTypes };
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(localRequire, loaded, loaded.exports);
  return loaded.exports.ReceiptReview;
}

test("correction choices change only the chosen field and announce the change", () => {
  const render = review();
  const fields = extractReceiptFields('שם הספק: אור חשמנ בע״מ\nקבלה\nסה״כ לתשלום 1180 ₪\nסכום ששולם 600 ₪', { merchants: ['אור חשמל בע"מ'] });
  const expense = { amount: fields.amount, merchant: fields.merchant, currency: "ILS", notes: "Manual notes", category_id: "electrical" };
  const props = { fields, onSelectAmount: (amount: string) => { expense.amount = amount; }, onSelectMerchant: (merchant: string) => { expense.merchant = merchant; } };
  const tree = elements(render(props));
  assert.ok(tree.some((element) => element.type === "details"));
  const amount = tree.find((element) => element.props["aria-label"] === "בחירת סכום 1180.00")!;
  assert.equal(amount.props.type, "button");
  amount.props.onClick!();
  assert.deepEqual(expense, { amount: "1180.00", merchant: fields.merchant, currency: "ILS", notes: "Manual notes", category_id: "electrical" });
  assert.equal(elements(render(props)).find((element) => element.props.role === "status")?.props.children, "הסכום עודכן");
  const merchant = tree.find((element) => element.props["aria-label"] === 'בחירת ספק אור חשמנ בע"מ')!;
  assert.equal(merchant.props.type, "button");
  merchant.props.onClick!();
  assert.deepEqual(expense, { amount: "1180.00", merchant: 'אור חשמנ בע"מ', currency: "ILS", notes: "Manual notes", category_id: "electrical" });
  assert.equal(elements(render(props)).find((element) => element.props.role === "status")?.props.children, "שם הספק עודכן");
});

test("ambiguous totals remain visible and all correction buttons disable during save", () => {
  const fields = extractReceiptFields('אור חשמנ בע״מ\nקבלה\nסה״כ לתשלום 100 ₪\nסה״כ לתשלום 200 ₪', { merchants: ['אור חשמל בע"מ'] });
  const tree = review()({ fields, disabled: true, onSelectAmount: () => {}, onSelectMerchant: () => {} });
  const buttons = elements(tree).filter((element) => element.type === "button");
  assert.equal(buttons.length, 4);
  assert.ok(buttons.every((element) => element.props.disabled && element.props.type === "button"));
  // Required total choices precede the optional supplier disclosure.
  const children = tree.props.children as Element[];
  assert.equal(children[1].type, "div");
  assert.equal(children[2].type, "details");
});

test("one confident amount and supplier do not add an unnecessary correction disclosure", () => {
  const fields = extractReceiptFields('אור חשמל בע״מ\nקבלה\nסה״כ לתשלום 100 ₪');
  const tree = elements(review()({ fields, onSelectAmount: () => {}, onSelectMerchant: () => {} }));
  assert.ok(!tree.some((element) => element.type === "details" || element.type === "button"));
});
