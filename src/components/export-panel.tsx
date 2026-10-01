"use client";

import type { Category } from "@/lib/expenses";
import { paymentStatuses, stages } from "@/lib/renovation-guide";
import { Download } from "lucide-react";

export function ExportPanel({ categories }: { categories: Category[] }) {
  return (
    <details className="export-panel">
      <summary><Download size={17} /> יצוא נתוני הוצאות</summary>
      <form action="/api/exports/expenses" method="get" className="export-form">
        <p className="muted">המסננים כאן חלים על הקובץ כולו, כולל הוצאות שאינן מוצגות בעמוד הנוכחי.</p>
        <div className="export-filters">
          <label>
            מתאריך
            <input type="date" name="from" />
          </label>
          <label>
            עד תאריך
            <input type="date" name="to" />
          </label>
          <label>
            קטגוריה
            <select name="category" defaultValue="">
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
            <input name="q" type="search" maxLength={100} placeholder="חיפוש לפי שם" />
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
        <button className="primary"><Download size={17} /> הורדת הקובץ</button>
      </form>
    </details>
  );
}
