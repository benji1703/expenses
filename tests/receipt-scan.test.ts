import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import test from "node:test";
import * as extraction from "../src/lib/receipt-ocr.ts";

const require = createRequire(import.meta.url);
function scanner() {
  let recognized = 0, loaded = 0;
  const source = ts.transpileModule(readFileSync(new URL("../src/components/use-receipt-ocr.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const loadedModule = { exports: {} as { useReceiptOcr: () => { scan: (files: File[], context?: extraction.ReceiptContext, fresh?: boolean) => Promise<{ fields?: extraction.ReceiptFields }[]> } } };
  const localRequire = (name: string) => {
    if (name === "react") return { useState: (value: unknown) => [value, () => {}], useRef: (value: unknown) => ({ current: value }), useEffect: () => {}, useCallback: (fn: unknown) => fn };
    if (name === "@/lib/receipt-ocr") return extraction;
    if (name === "@/lib/receipt-image") return { prepareReceiptImage: async (file: File) => file };
    if (name === "@/lib/receipt-pdf") return {};
    if (name === "tesseract.js") return { createWorker: async () => { loaded++; return {
      setParameters: async () => {}, terminate: async () => {}, recognize: async () => { recognized++; return { data: { blocks: null, text: 'ספק חשמל בע״מ\nקבלה\nסה״כ לתשלום 361.95 ₪' } }; },
    }; } };
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(localRequire, loadedModule, loadedModule.exports);
  return { ...loadedModule.exports.useReceiptOcr(), recognized: () => recognized, loaded: () => loaded };
}

test("additional files reuse OCR text and rematch new categories; explicit retry scans again", async () => {
  const app = scanner();
  const first = new File(["one"], "first.png", { type: "image/png" });
  const second = new File(["two"], "second.png", { type: "image/png" });
  assert.equal((await app.scan([first]))[0].fields?.amount, "361.95");
  const categories = [{ id: "new-category", name: "חשמל" }];
  const added = await app.scan([first, second], { categories });
  assert.equal(app.recognized(), 2); assert.equal(app.loaded(), 2);
  assert.equal(added[0].fields?.category_id, "new-category");
  await app.scan([first, second], { categories }, true);
  assert.equal(app.recognized(), 4);
});
