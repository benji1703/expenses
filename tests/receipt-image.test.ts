import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { extractReceiptFields } from "../src/lib/receipt-ocr.ts";

const require = createRequire(import.meta.url);
const { createWorker, PSM } = require("tesseract.js") as typeof import("tesseract.js");
const root = fileURLToPath(new URL("../", import.meta.url));

test("real Hebrew image uses shipped OCR languages and extracts final total", { timeout: 60_000 }, async () => {
  const cache = await mkdtemp(path.join(tmpdir(), "receipt-ocr-"));
  let worker: import("tesseract.js").Worker | undefined;
  try {
    worker = await createWorker(["heb", "eng"], 1, {
      langPath: path.join(root, "public/tesseract/lang"), cachePath: cache, gzip: true,
    });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: "1", user_defined_dpi: "300" });
    const result = await worker.recognize(path.join(root, "tests/fixtures/hebrew-tax-receipt.png"), { rotateAuto: true });
    const fields = extractReceiptFields(result.data.text, {
      merchants: ['אור חשמל בע"מ'], categories: [{ id: "electrical", name: "חשמל ואינסטלציה" }],
    });
    assert.equal(fields.merchant, 'אור חשמל בע"מ');
    assert.equal(fields.amount, "1180.00");
    assert.equal(fields.currency, "ILS");
    assert.equal(fields.document_type, "tax_receipt");
    assert.equal(fields.payment_status, "paid");
    assert.equal(fields.spent_on, "2026-10-02");
    assert.equal(fields.reference, "004821");
    assert.equal(fields.category_id, "electrical");
  } finally {
    await worker?.terminate();
    await rm(cache, { recursive: true, force: true });
  }
});
