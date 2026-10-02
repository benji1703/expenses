"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Worker, PSM } from "tesseract.js";
import { extractReceiptFields, receiptPdfText, type ReceiptContext, type ReceiptFields } from "@/lib/receipt-ocr";

export type ReceiptScan = { file_name: string; fields?: ReceiptFields; error?: string };
const unreadable = "לא הצלחנו לזהות פרטים מהמסמך. אפשר למלא את הטופס ידנית.";
function quality(fields: ReceiptFields) {
  return (fields.amount ? 4 : 0) + (fields.merchant ? 2 : 0) + (fields.document_type ? 1 : 0) + (fields.spent_on ? 1 : 0);
}

export function useReceiptOcr() {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<ReceiptScan[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; void workerRef.current?.terminate(); workerRef.current = null; };
  }, []);
  const reset = useCallback(() => { setResults([]); setError(""); }, []);

  const scan = useCallback(async (files: File[], context: ReceiptContext = {}) => {
    setProcessing(true); setProgress(0); setError(""); setResults([]);
    let worker: Worker | undefined;
    const assertActive = () => { if (!mounted.current) throw new Error("הסריקה הופסקה."); };
    let currentFile = 0, currentPage = 0, pageCount = 1;
    const updateProgress = (fraction: number) => {
      if (mounted.current) setProgress((previous) => Math.max(previous, Math.min(99, Math.round((currentFile + (currentPage + fraction) / pageCount) / files.length * 100))));
    };
    const recognize = async (image: Blob) => {
      assertActive();
      if (!worker) {
        setStatus("טוענים זיהוי עברית ואנגלית…");
        const { createWorker } = await import("tesseract.js");
        worker = await createWorker(["heb", "eng"], 1, {
          workerPath: "/tesseract/worker.min.js", corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
          langPath: "/tesseract/lang", workerBlobURL: false,
          logger: (message) => { if (message.status === "recognizing text") updateProgress(message.progress); },
        });
        if (!mounted.current) { await worker.terminate(); worker = undefined; assertActive(); }
        workerRef.current = worker ?? null;
      }
      assertActive();
      setStatus(`קוראים ${files[currentFile].name} · ${currentFile + 1}/${files.length}`);
      await worker!.setParameters({ tessedit_pageseg_mode: "3" as PSM, preserve_interword_spaces: "1", user_defined_dpi: "300" });
      const first = await worker!.recognize(image, { rotateAuto: true });
      let text = first.data.text;
      // One targeted retry for sparse/poorly aligned receipts; no extra pass on successful scans.
      if (!extractReceiptFields(text, context).amount) {
        assertActive();
        await worker!.setParameters({ tessedit_pageseg_mode: "11" as PSM });
        const retry = await worker!.recognize(image, { rotateAuto: true });
        if (quality(extractReceiptFields(retry.data.text, context)) > quality(extractReceiptFields(text, context))) text = retry.data.text;
      }
      return text;
    };
    const readPdf = async (file: File) => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
      try {
        const pdf = await loadingTask.promise;
        if (pdf.numPages > 8) throw new Error("אפשר לסרוק עד 8 עמודים בכל קובץ.");
        pageCount = pdf.numPages;
        const texts: string[] = [];
        for (currentPage = 0; currentPage < pageCount; currentPage++) {
          assertActive();
          setStatus(`קוראים ${file.name} · עמוד ${currentPage + 1}/${pageCount}`);
          const page = await pdf.getPage(currentPage + 1);
          try {
            const content = await page.getTextContent();
            const text = receiptPdfText(content.items.filter((item) => "str" in item));
            // Digital PDF text avoids raster OCR entirely; scanned pages fall back to OCR.
            if (text.trim().length >= 40 && quality(extractReceiptFields(text, context)) >= 6) {
              texts.push(text);
            } else {
              const base = page.getViewport({ scale: 1 });
              const scale = Math.min(2.5, Math.sqrt(8_000_000 / (base.width * base.height)));
              const viewport = page.getViewport({ scale });
              const canvas = document.createElement("canvas");
              try {
                const context2d = canvas.getContext("2d");
                if (!context2d) throw new Error("לא ניתן לעבד את מסמך ה־PDF.");
                canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
                await page.render({ canvas, canvasContext: context2d, viewport }).promise;
                const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("לא ניתן לקרוא את עמוד ה־PDF.")), "image/png"));
                const recognized = await recognize(blob);
                texts.push(quality(extractReceiptFields(text, context)) > quality(extractReceiptFields(recognized, context)) ? text : recognized);
              } finally { canvas.width = 0; canvas.height = 0; }
            }
            updateProgress(1);
          } finally { page.cleanup(); }
        }
        return texts.join("\n");
      } finally { await loadingTask.destroy(); }
    };
    try {
      if (!files.length || files.length > 10 || files.reduce((size, file) => size + file.size, 0) > 10 * 1024 * 1024)
        throw new Error("בחרו עד 10 קבצים, עד 10 MB בסך הכול.");
      const scanned: ReceiptScan[] = [];
      // Never concatenate different attachments or add their totals together.
      for (currentFile = 0; currentFile < files.length; currentFile++) {
        assertActive(); currentPage = 0; pageCount = 1;
        const file = files[currentFile];
        try {
          const text = file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? await readPdf(file) : await recognize(file);
          assertActive();
          const fields = extractReceiptFields(text, context);
          if (!fields.merchant && !fields.amount && !fields.spent_on && !fields.amount_candidates.length) throw new Error(unreadable);
          scanned.push({ file_name: file.name, fields });
        } catch (cause) {
          assertActive();
          scanned.push({ file_name: file.name, error: cause instanceof Error ? cause.message : "סריקת הקבלה נכשלה." });
        }
        setResults([...scanned]);
      }
      setProgress(100);
      if (!scanned.some((item) => item.fields)) setError(unreadable);
      return scanned;
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "סריקת הקבלה נכשלה.");
      return [];
    } finally {
      // Unmount cleanup may have already stopped this worker.
      if (worker && workerRef.current === worker) {
        workerRef.current = null;
        try { await worker.terminate(); } catch { /* Already terminated. */ }
      }
      if (mounted.current) { setProcessing(false); setStatus(""); }
    }
  }, []);
  return { scan, processing, progress, status, error, results, reset };
}
