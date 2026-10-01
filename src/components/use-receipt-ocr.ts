"use client";

import { useCallback, useState } from "react";
import { createWorker, type Worker } from "tesseract.js";

export type ReceiptFields = {
  merchant?: string;
  amount?: string;
  spent_on?: string;
  notes?: string;
};

async function pdfPages(file: File): Promise<Blob[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  if (pdf.numPages > 8) throw new Error("אפשר לסרוק עד 8 עמודים בכל פעם.");
  const pages: Blob[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("לא ניתן לעבד את מסמך ה־PDF.");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    pages.push(await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("לא ניתן לקרוא את עמוד ה־PDF.")), "image/png"),
    ));
  }
  return pages;
}

function extractFields(text: string): ReceiptFields {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const cleaned = lines.filter((line) => line.length > 2 && !/^[-\d\s/.,:]+$/.test(line));
  const merchant = cleaned.slice(0, 3).sort((a, b) => a.length - b.length)[0]?.slice(0, 160);
  const amountPatterns = [
    /(?:סה["״׳']?כ|סך\s*הכל|לתשלום|סהכ|total|amount\s*due)[^\d]{0,16}(\d{1,8}(?:[.,]\d{1,2})?)/i,
    /(?:₪|ILS|NIS)\s*(\d{1,8}(?:[.,]\d{1,2})?)/i,
    /(\d{1,8}(?:[.,]\d{1,2})?)\s*(?:₪|ILS|NIS)/i,
  ];
  let amount: string | undefined;
  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (match) {
      const value = Number(match[1].replace(",", "."));
      if (value > 0 && value <= 99_999_999.99) { amount = value.toFixed(2); break; }
    }
  }
  const dateMatch = text.match(/(?:^|\D)(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?:\D|$)/m)
    ?? text.match(/(?:^|\D)(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})(?:\D|$)/m);
  let spent_on: string | undefined;
  if (dateMatch) {
    let year: number, month: number, day: number;
    if (dateMatch[1].length === 4) { year = +dateMatch[1]; month = +dateMatch[2]; day = +dateMatch[3]; }
    else { day = +dateMatch[1]; month = +dateMatch[2]; year = +dateMatch[3]; if (year < 100) year += year < 50 ? 2000 : 1900; }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && year >= 2000 && year <= 2100)
      spent_on = date.toISOString().slice(0, 10);
  }
  return { merchant, amount, spent_on, notes: text.trim().slice(0, 2000) || undefined };
}

export function useReceiptOcr() {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<ReceiptFields | null>(null);
  const scan = useCallback(async (file: File) => {
    setProcessing(true); setProgress(0); setError(""); setFields(null);
    let worker: Worker | undefined;
    try {
      const images = file.type === "application/pdf" ? await pdfPages(file) : [file];
      worker = await createWorker(["heb", "eng"], 1, {
        logger: (message) => { if (message.status === "recognizing text") setProgress(Math.round(message.progress * 100)); },
      });
      let text = "";
      for (let index = 0; index < images.length; index++) {
        const result = await worker.recognize(images[index]);
        text += `${result.data.text}\n`;
        setProgress(Math.round(((index + 1) / images.length) * 100));
      }
      const parsed = extractFields(text);
      if (!parsed.merchant && !parsed.amount && !parsed.spent_on)
        throw new Error("לא הצלחנו לזהות פרטים מהמסמך. אפשר למלא את הטופס ידנית.");
      setFields(parsed);
      return parsed;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "סריקת הקבלה נכשלה.";
      setError(message); throw cause;
    } finally {
      await worker?.terminate(); setProcessing(false); setProgress(0);
    }
  }, []);
  return { scan, processing, progress, error, fields };
}
