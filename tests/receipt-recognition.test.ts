import assert from "node:assert/strict";
import test from "node:test";
import type { Worker } from "tesseract.js";
import { recognizeReceiptImage } from "../src/lib/receipt-recognition.ts";
import { extractReceiptFields } from "../src/lib/receipt-ocr.ts";

function worker(passes: string[]) {
  const modes: string[] = []; let calls = 0;
  return { modes, calls: () => calls, value: {
    setParameters: async ({ tessedit_pageseg_mode }: { tessedit_pageseg_mode: string }) => { modes.push(tessedit_pageseg_mode); },
    recognize: async () => ({ data: { blocks: null, text: passes[calls++] } }),
  } as unknown as Worker };
}

test("a small currency-only number triggers sparse OCR rather than ending recognition", async () => {
  const engine = worker(['קבלה\n₪ 1', 'שם הספק: ספק בע״מ\nקבלה\nהסכום לתשלום ₪ 1,297.10']);
  const text = await recognizeReceiptImage(engine.value, new Blob());
  assert.deepEqual(engine.modes, ['3', '11']);
  assert.equal(extractReceiptFields(text).amount, '1297.10');
});

test("OCR preserves genuine conflicting totals and explicit zero rather than selecting a later single guess", async () => {
  for (const first of ['קבלה\nסה״כ לתשלום 100 ₪\nסה״כ לתשלום 200 ₪', 'קבלה\nסה״כ לתשלום 0.00 ₪']) {
    const engine = worker([first, 'קבלה\nסה״כ לתשלום 1 ₪']);
    assert.equal(await recognizeReceiptImage(engine.value, new Blob()), first);
    assert.equal(engine.calls(), 1);
  }
});

test("recognition cancellation stops before a second expensive pass", async () => {
  const engine = worker(['קבלה\n₪ 1', 'קבלה\nסה״כ לתשלום 100 ₪']);
  let checkpoints = 0;
  await assert.rejects(recognizeReceiptImage(engine.value, new Blob(), { assertActive: () => { if (++checkpoints > 1) throw new Error('cancelled'); } }), /cancelled/);
  assert.equal(engine.calls(), 1);
});
