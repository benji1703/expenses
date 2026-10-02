"use client";

import type { Category } from "@/lib/expenses";
import { paymentStatuses, stages } from "@/lib/renovation-guide";
import { Download, LoaderCircle } from "lucide-react";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { isDisconnected, subscribeConnection } from "@/lib/connection-state";
import { requestExpenseExport } from "@/lib/expense-export";

export type ExportFilters = { from?: string; to?: string; category?: string; q?: string };

export function ExportPanel({ categories, filters = {} }: { categories: Category[]; filters?: ExportFilters }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const disconnected = useSyncExternalStore(subscribeConnection, isDisconnected, () => false);

  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    const params = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => { if (typeof value === "string") params.set(key, value); });
    if (disconnected) { setError("נדרש חיבור להורדת הוצאות."); return; }
    setBusy(true);
    try {
      const { blob, filename } = await requestExpenseExport(params);
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "הורדת הקובץ נכשלה. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="export-panel">
      <summary><Download size={17} /> יצוא נתוני הוצאות</summary>
      <form action="/api/exports/expenses" method="get" data-online-only="true" className="export-form" onSubmit={download}>
        <p className="muted">כל ההוצאות התואמות למסננים, מכל העמודים.</p>
        <div className="export-filters">
          <label>
            מתאריך
            <input type="date" name="from" defaultValue={filters.from ?? ""} />
          </label>
          <label>
            עד תאריך
            <input type="date" name="to" defaultValue={filters.to ?? ""} />
          </label>
          <label>
            קטגוריה
            <select name="category" defaultValue={filters.category ?? ""}>
              <option value="">כל הקטגוריות</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label>
            סטטוס תשלום
            <select name="status" defaultValue="">
              <option value="">כל הסטטוסים</option>
              {Object.entries(paymentStatuses).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
            </select>
          </label>
          <label>
            שלב בפרויקט
            <select name="stage" defaultValue="">
              <option value="">כל השלבים</option>
              {Object.entries(stages).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
            </select>
          </label>
          <label>
            מטבע
            <select name="currency" defaultValue="">
              <option value="">כל המטבעות</option>
              <option value="ILS">ש״ח · ILS</option>
              <option value="USD">דולר · USD</option>
              <option value="EUR">אירו · EUR</option>
              <option value="GBP">ליש״ט · GBP</option>
            </select>
          </label>
          <label>
            ספק או רשות
            <input name="q" type="search" maxLength={100} placeholder="חיפוש לפי שם" defaultValue={filters.q ?? ""} />
          </label>
          <label>
            פורמט קובץ
            <select name="format" defaultValue="xlsx">
              <option value="xlsx">Excel ‏(.xlsx)</option>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </label>
        </div>
        {error && <p className="message error" role="alert">{error}</p>}
        {disconnected && <p className="muted">נדרש חיבור להורדת הוצאות.</p>}
        <button className="primary" disabled={busy || disconnected}>{busy ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />} {busy ? "מכינים קובץ…" : "הורדת הקובץ"}</button>
      </form>
    </details>
  );
}
