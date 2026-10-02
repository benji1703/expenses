// Local-only validation. Never copies documents or full OCR text into the repo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { extractReceiptFields, receiptOcrText, receiptImageSize, receiptFieldQuality } from '../src/lib/receipt-ocr.ts';
import { readReceiptPdf } from '../src/lib/receipt-pdf.ts';
const require = createRequire(import.meta.url);
const { createCanvas, loadImage, DOMMatrix, ImageData, Path2D } = require('@napi-rs/canvas');
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { createWorker, PSM } = require('tesseract.js');
const files = process.argv.slice(2);
if (!files.length) throw new Error('Usage: node --experimental-strip-types scripts/check-receipts.mjs /path/to/invoice.pdf ...');
const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'meshek-ocr-check-'));
let worker;
async function recognize(blob) {
  worker ??= await createWorker(['heb', 'eng'], 1, { langPath: path.resolve('public/tesseract/lang'), cachePath: cache });
  const image = Buffer.from(await blob.arrayBuffer());
  const pass = async (mode) => {
    await worker.setParameters({ tessedit_pageseg_mode: mode, preserve_interword_spaces: '1', user_defined_dpi: '300' });
    const result = await worker.recognize(image, { rotateAuto: true }, { text: true, blocks: true });
    return receiptOcrText(result.data.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)) ?? []) || result.data.text;
  };
  const first = await pass(PSM.AUTO);
  if (extractReceiptFields(first).amount) return first;
  const retry = await pass(PSM.SPARSE_TEXT);
  return receiptFieldQuality(extractReceiptFields(retry)) > receiptFieldQuality(extractReceiptFields(first)) ? retry : first;
}
try {
  for (const file of files) {
    const started = Date.now(); let pagesRead = 0;
    try {
      let text;
      if (/\.pdf$/i.test(file)) {
        const task = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true });
        try {
          text = await readReceiptPdf(await task.promise, {
            context: {}, recognize, onPage: index => { pagesRead = index + 1; },
            render: async page => {
              const base = page.getViewport({ scale: 1 });
              const viewport = page.getViewport({ scale: Math.min(3, Math.sqrt(6_000_000 / (base.width * base.height))) });
              const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
              await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport, background: 'white' }).promise;
              return new Blob([canvas.toBuffer('image/png')], { type: 'image/png' });
            },
          });
        } finally { await task.destroy(); }
      } else {
        const image = await loadImage(file), size = receiptImageSize(image.width, image.height);
        const canvas = createCanvas(size.width, size.height), context = canvas.getContext('2d');
        context.fillStyle = 'white'; context.fillRect(0, 0, size.width, size.height);
        context.drawImage(image, 0, 0, size.width, size.height);
        text = await recognize(new Blob([canvas.toBuffer('image/png')], { type: 'image/png' }));
      }
      const fields = extractReceiptFields(text);
      console.log(JSON.stringify({ file: path.basename(file), amount: fields.amount ?? null, supplierFound: !!fields.merchant, type: fields.document_type ?? null, status: fields.payment_status ?? null, dateFound: !!fields.spent_on, candidates: fields.amount_candidates, pagesRead, ms: Date.now() - started }));
    } catch (error) {
      console.log(JSON.stringify({ file: path.basename(file), error: error.message }));
      process.exitCode = 1;
    }
  }
} finally {
  await worker?.terminate(); fs.rmSync(cache, { recursive: true, force: true });
}
