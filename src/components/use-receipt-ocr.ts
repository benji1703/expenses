"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Worker } from "tesseract.js";
import { extractReceiptFields, type ReceiptContext, type ReceiptFields } from "@/lib/receipt-ocr";
import { recognizeReceiptImage } from "@/lib/receipt-recognition";
import { prepareReceiptImage } from "@/lib/receipt-image";
import { readReceiptPdf } from "@/lib/receipt-pdf";

export type ReceiptScan = { file_name: string; fields?: ReceiptFields; error?: string };
const unreadable = "לא זוהו פרטים. אפשר למלא ידנית או לבחור צילום ברור יותר.";

export function useReceiptOcr() {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<ReceiptScan[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const textCache = useRef(new WeakMap<File, string>());
  const mounted = useRef(true);
  const generation = useRef(0);
  const cancel = useCallback(() => {
    generation.current++;
    const worker = workerRef.current; workerRef.current = null;
    if (worker) void worker.terminate().catch(() => {});
    setProcessing(false); setStatus("");
  }, []);
  useEffect(() => {
    mounted.current = true;
    const runs = generation;
    return () => {
      mounted.current = false; runs.current++;
      void workerRef.current?.terminate().catch(() => {}); workerRef.current = null;
    };
  }, []);
  const reset = useCallback(() => { cancel(); setResults([]); setError(""); }, [cancel]);

  const scan = useCallback(async (files: File[], context: ReceiptContext = {}, fresh = false) => {
    const run = ++generation.current;
    const active = () => mounted.current && generation.current === run;
    setProcessing(true); setProgress(0); setError(""); setResults([]);
    let worker: Worker | undefined;
    const assertActive = () => { if (!active()) throw new Error("הסריקה הופסקה."); };
    let currentFile = 0, currentPage = 0, pageCount = 1;
    const updateProgress = (fraction: number) => {
      if (active()) setProgress((previous) => Math.max(previous, Math.min(99, Math.round((currentFile + (currentPage + fraction) / pageCount) / files.length * 100))));
    };
    const recognize = async (image: Blob) => {
      assertActive();
      if (!worker) {
        setStatus("טוענים זיהוי עברית…");
        const { createWorker } = await import("tesseract.js");
        assertActive();
        worker = await createWorker(["heb", "eng"], 1, {
          workerPath: "/tesseract/worker.min.js", corePath: "/tesseract",
          langPath: "/tesseract/lang", workerBlobURL: false,
          logger: (message) => { if (message.status === "recognizing text") updateProgress(message.progress); },
        });
        if (!active()) { await worker.terminate(); worker = undefined; assertActive(); }
        workerRef.current = worker ?? null;
      }
      assertActive();
      setStatus(`סורקים ${files[currentFile].name} · ${currentFile + 1}/${files.length}`);
      return recognizeReceiptImage(worker!, image, { context, assertActive, onRetry: () => setStatus("בודקים את הסכום…") });
    };
    const readPdf = async (file: File) => {
      const pdfjs = await import("pdfjs-dist");
      assertActive(); pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
      try {
        return await readReceiptPdf(await task.promise, {
          context, recognize, assertActive,
          onPage: (page, count) => { currentPage = page; pageCount = count; setStatus(`קוראים ${file.name} · עמוד ${page + 1}`); },
          render: async (page) => {
            assertActive();
            const base = page.getViewport({ scale: 1 });
            const scale = Math.min(3, Math.sqrt(6_000_000 / (base.width * base.height)));
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            try {
              const context2d = canvas.getContext("2d");
              if (!context2d) throw new Error("לא ניתן לעבד את מסמך ה־PDF.");
              canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
              await page.render({ canvas, canvasContext: context2d, viewport, background: "white" }).promise;
              assertActive();
              return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("לא ניתן לקרוא את עמוד ה־PDF.")), "image/png"));
            } finally { canvas.width = 0; canvas.height = 0; }
          },
        });
      } finally { await task.destroy(); }
    };
    try {
      if (!files.length || files.length > 10 || files.reduce((size, file) => size + file.size, 0) > 10 * 1024 * 1024)
        throw new Error("בחרו עד 10 קבצים, עד 10 MB בסך הכול.");
      const scanned: ReceiptScan[] = [];
      for (currentFile = 0; currentFile < files.length; currentFile++) {
        assertActive(); currentPage = 0; pageCount = 1;
        const file = files[currentFile];
        try {
          // Adding another attachment should not decode and OCR earlier files
          // again. Re-extract cached text with the current category/supplier list.
          const cached = fresh ? undefined : textCache.current.get(file);
          const text = cached ?? (file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? await readPdf(file) : await recognize(await prepareReceiptImage(file)));
          assertActive();
          const fields = extractReceiptFields(text, context);
          if (!fields.merchant && !fields.amount && !fields.spent_on && !fields.amount_candidates.length) throw new Error(unreadable);
          textCache.current.set(file, text);
          scanned.push({ file_name: file.name, fields });
        } catch (cause) {
          assertActive();
          scanned.push({ file_name: file.name, error: cause instanceof Error && /password/i.test(cause.message) ? "המסמך מוגן בסיסמה. צרפו עותק פתוח או מלאו ידנית." : cause instanceof Error ? cause.message : unreadable });
        }
        setResults([...scanned]);
      }
      setProgress(100);
      if (!scanned.some((item) => item.fields)) setError(unreadable);
      return scanned;
    } catch (cause) {
      if (active()) setError(cause instanceof Error ? cause.message : unreadable);
      return [];
    } finally {
      if (worker && workerRef.current === worker) {
        workerRef.current = null;
        try { await worker.terminate(); } catch { /* Already terminated. */ }
      }
      if (active()) { setProcessing(false); setStatus(""); }
    }
  }, []);
  return { scan, cancel, processing, progress, status, error, results, reset };
}
