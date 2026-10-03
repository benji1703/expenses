import type { PSM, Worker } from "tesseract.js";
import { extractReceiptFields, receiptFieldQuality, receiptOcrText, type ReceiptContext } from "./receipt-ocr.ts";

/** The app and local PDF checks share the same word-level OCR and retry policy. */
export async function recognizeReceiptImage(worker: Worker, image: Parameters<Worker["recognize"]>[0], options: {
  context?: ReceiptContext;
  assertActive?: () => void;
  onRetry?: () => void;
} = {}) {
  const context = options.context ?? {};
  async function pass(mode: PSM) {
    options.assertActive?.();
    await worker.setParameters({ tessedit_pageseg_mode: mode, preserve_interword_spaces: "1", user_defined_dpi: "300" });
    const { data } = await worker.recognize(image, { rotateAuto: true }, { text: true, blocks: true });
    options.assertActive?.();
    return receiptOcrText(data.blocks?.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)) ?? []) || data.text;
  }
  const first = await pass("3" as PSM);
  const fields = extractReceiptFields(first, context);
  // A different segmentation must not discard a valid ambiguous total or zero.
  if (fields.zero_total || fields.amount || (fields.amount_candidates.length && fields.amount_source === "total")) return first;
  options.onRetry?.();
  const retry = await pass("11" as PSM);
  return receiptFieldQuality(extractReceiptFields(retry, context)) > receiptFieldQuality(fields) ? retry : first;
}
