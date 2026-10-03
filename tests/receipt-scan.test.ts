import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import test from "node:test";
import * as extraction from "../src/lib/receipt-ocr.ts";
import { recognizeReceiptImage } from "../src/lib/receipt-recognition.ts";

const require = createRequire(import.meta.url);
function scanner() {
  let recognized = 0, loaded = 0;
  const corePaths: string[] = [];
  const source = ts.transpileModule(readFileSync(new URL("../src/components/use-receipt-ocr.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const loadedModule = { exports: {} as { useReceiptOcr: () => { scan: (files: File[], context?: extraction.ReceiptContext, fresh?: boolean) => Promise<{ fields?: extraction.ReceiptFields }[]> } } };
  const localRequire = (name: string) => {
    if (name === "react") return { useState: (value: unknown) => [value, () => {}], useRef: (value: unknown) => ({ current: value }), useEffect: () => {}, useCallback: (fn: unknown) => fn };
    if (name === "@/lib/receipt-ocr") return extraction;
    if (name === "@/lib/receipt-recognition") return { recognizeReceiptImage };
    if (name === "@/lib/receipt-image") return { prepareReceiptImage: async (file: File) => file };
    if (name === "@/lib/receipt-pdf") return {};
    if (name === "tesseract.js") return { createWorker: async (_languages: unknown, _oem: unknown, options: { corePath: string }) => { loaded++; corePaths.push(options.corePath); return {
      setParameters: async () => {}, terminate: async () => {}, recognize: async () => { recognized++; return { data: { blocks: null, text: 'ספק חשמל בע״מ\nקבלה\nסה״כ לתשלום 361.95 ₪' } }; },
    }; } };
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(localRequire, loadedModule, loadedModule.exports);
  return { ...loadedModule.exports.useReceiptOcr(), recognized: () => recognized, loaded: () => loaded, corePaths };
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

test("the app's browser worker resolves shipped compatible cores with and without SIMD", async () => {
  const app = scanner();
  await app.scan([new File(['one'], 'first.png', { type: 'image/png' })]);
  const source = readFileSync(require.resolve('tesseract.js/src/worker-script/browser/getCore.js'), 'utf8');
  for (const simd of [true, false]) {
    let imported = '';
    const core = () => {};
    const browserGlobal = { TesseractCore: undefined as unknown, importScripts: (url: string) => { imported = url; browserGlobal.TesseractCore = core; } };
    const browserModule = { exports: undefined as unknown as (lstmOnly: boolean, corePath: string, response: object) => Promise<unknown> };
    const localRequire = (name: string) => name === 'wasm-feature-detect' ? { simd: async () => simd } : require('tesseract.js/package.json');
    vm.runInThisContext(`(function(require,module,global){${source}\n})`)(localRequire, browserModule, browserGlobal);
    assert.equal(await browserModule.exports(true, app.corePaths[0], { progress: () => {} }), core);
    const file = simd ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js';
    const deployed = readFileSync(new URL(`../public/tesseract/${file}`, import.meta.url));
    const installed = readFileSync(path.join(path.dirname(require.resolve('tesseract.js-core/package.json')), file));
    assert.equal(imported, `/tesseract/${file}`);
    assert.equal(createHash('sha256').update(deployed).digest('hex'), createHash('sha256').update(installed).digest('hex'));
  }
});
