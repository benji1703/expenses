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

test("scanned Hebrew electricity PDF extracts 361.95 through the production PDF and layout pipeline", { timeout: 60_000 }, async () => {
  const { readFile } = await import("node:fs/promises");
  const { readReceiptPdf } = await import("../src/lib/receipt-pdf.ts");
  const { receiptOcrText } = await import("../src/lib/receipt-ocr.ts");
  const canvasRuntime = require("@napi-rs/canvas");
  Object.assign(globalThis, { DOMMatrix: canvasRuntime.DOMMatrix, ImageData: canvasRuntime.ImageData, Path2D: canvasRuntime.Path2D });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const cache = await mkdtemp(path.join(tmpdir(), "electricity-ocr-"));
  const task = pdfjs.getDocument({ data: new Uint8Array(await readFile(path.join(root, "tests/fixtures/hebrew-electricity-bill.pdf"))) });
  let worker: import("tesseract.js").Worker | undefined;
  try {
    worker = await createWorker(["heb", "eng"], 1, { langPath: path.join(root, "public/tesseract/lang"), cachePath: cache, gzip: true });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: "1", user_defined_dpi: "300" });
    const text = await readReceiptPdf(await task.promise, {
      context: {},
      render: async (page) => {
        const viewport = page.getViewport({ scale: 3 });
        const canvas = canvasRuntime.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport, background: "white" }).promise;
        return new Blob([canvas.toBuffer("image/png")], { type: "image/png" });
      },
      recognize: async (blob) => {
        const result = await worker!.recognize(Buffer.from(await blob.arrayBuffer()), { rotateAuto: true }, { text: true, blocks: true });
        return receiptOcrText(result.data.blocks!.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)));
      },
    });
    const fields = extractReceiptFields(text);
    assert.equal(fields.amount, "361.95");
    assert.equal(fields.merchant, 'חברת החשמל לישראל בע"מ');
    assert.equal(fields.spent_on, "2021-07-21");
    assert.equal(fields.due_on, "2021-08-10");
    assert.equal(fields.payment_status, "unpaid");
    assert.equal(fields.notes, undefined);
  } finally {
    await task.destroy(); await worker?.terminate(); await rm(cache, { recursive: true, force: true });
  }
});
