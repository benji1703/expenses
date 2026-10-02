import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { extractReceiptFields, receiptFieldQuality, receiptFieldsComplete, receiptPdfText, type ReceiptContext } from "./receipt-ocr.ts";

export async function readReceiptPdf(pdf: PDFDocumentProxy, options: {
  context: ReceiptContext;
  recognize: (image: Blob) => Promise<string>;
  render: (page: PDFPageProxy) => Promise<Blob>;
  onPage?: (page: number, count: number) => void;
  assertActive?: () => void;
}) {
  const pages = Math.min(pdf.numPages, 8);
  const texts: string[] = [];
  for (let index = 0; index < pages; index++) {
    options.assertActive?.(); options.onPage?.(index, pages);
    const page = await pdf.getPage(index + 1);
    try {
      const content = await page.getTextContent();
      let text = receiptPdfText(content.items.filter((item) => "str" in item));
      // Embedded amounts are exact; never rasterize a readable digital invoice
      // just because another optional field was missing.
      const fields = extractReceiptFields(text, options.context);
      const readable = fields.amount || fields.amount_candidates.length || (text.trim().length >= 200 && /[א-תa-z]/i.test(text));
      if (!readable) {
        const recognized = await options.recognize(await options.render(page));
        if (receiptFieldQuality(extractReceiptFields(recognized, options.context)) > receiptFieldQuality(extractReceiptFields(text, options.context))) text = recognized;
      }
      texts.push(text);
      const combined = extractReceiptFields(texts.join("\n"), options.context);
      if (receiptFieldsComplete(combined) || combined.amount_candidates.length) break;
    } finally { page.cleanup(); }
  }
  return texts.join("\n");
}
