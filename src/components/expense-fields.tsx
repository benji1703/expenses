"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, ScanText, UploadCloud } from "lucide-react";
import { saveExpense, type ActionState } from "@/app/actions";
import { stages, paymentStatuses } from "@/lib/renovation-guide";
import type { Category, Expense } from "@/lib/expenses";
import { useReceiptOcr } from "@/components/use-receipt-ocr";
import { FormStatus } from "@/components/form-status";

const initial: ActionState = {};

export default function ExpenseFields({ categories, expense, onSaved }: {
  categories: Category[];
  expense?: Expense;
  onSaved: () => void;
}) {
  const [state, action, pending] = useActionState(saveExpense, initial);
  const [files, setFiles] = useState<string[]>([]);
  const { scan, processing: scanning, progress, error: ocrError, fields: ocrFields } = useReceiptOcr();
  const merchantRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state.success) onSaved();
  }, [state.success, onSaved]);

  return (
    <form action={action} className="stack" key={expense?.id ?? "new"}>
      {expense && <input type="hidden" name="id" value={expense.id} />}
      <label>
        ספק / קבלן / רשות
        <input
          name="merchant"
          ref={merchantRef}
          placeholder="למשל: רמ״י, אדריכל או קבלן"
          defaultValue={expense?.merchant}
          required
          maxLength={160}
          autoFocus
        />
      </label>
      <div className="form-grid">
        <label>
          סכום
          <input
            name="amount"
            ref={amountRef}
            type="number"
            min="0.01"
            max="99999999.99"
            step="0.01"
            placeholder="0.00"
            required
            defaultValue={expense?.amount}
          />
        </label>
        <label>
          מטבע
          <select
            name="currency"
            defaultValue={expense?.currency ?? "ILS"}
          >
            <option value="ILS">ILS · ₪</option>
            <option value="EUR">EUR · €</option>
            <option value="USD">USD · $</option>
            <option value="GBP">GBP · £</option>
          </select>
        </label>
      </div>
      <div className="form-grid">
        <label>
          תאריך ההוצאה / הדרישה
          <input
            name="spent_on"
            ref={dateRef}
            type="date"
            required
            defaultValue={
              expense?.spent_on ??
              new Date().toLocaleDateString("en-CA")
            }
          />
        </label>
        <label>
          קטגוריה
          <select
            name="category_id"
            defaultValue={expense?.category_id ?? ""}
            required
          >
            <option value="" disabled>
              בחרו קטגוריה
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <>
        <label className="upload">
          <UploadCloud size={27} />
          <strong>{files.length ? files.join(" · ") : "צירוף חשבוניות, קבלות או דרישות תשלום"}</strong>
          <span>אפשר לבחור כמה קבצים · PDF, JPG או PNG · עד 10 MB בסך הכול</span>
          <input
            ref={filesRef}
            name="receipts"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).map((item) => item.name))}
          />
        </label>
        {files.length > 0 && (
          <div className="ocr-controls">
            <button
              type="button"
              className="secondary"
              disabled={scanning || pending}
              onClick={async () => {
                const receipts = Array.from(filesRef.current?.files ?? []);
                if (!receipts.length) return;
                try {
                  const extracted = await scan(receipts);
                  if (merchantRef.current && extracted.merchant) merchantRef.current.value = extracted.merchant;
                  if (amountRef.current && extracted.amount) amountRef.current.value = extracted.amount;
                  if (dateRef.current && extracted.spent_on) dateRef.current.value = extracted.spent_on;
                  if (notesRef.current && extracted.notes) notesRef.current.value = extracted.notes;
                } catch { /* The hook exposes an accessible error below. */ }
              }}
            >
              {scanning ? <LoaderCircle className="spin" size={17} /> : <ScanText size={17} />}
              {scanning ? `סורקים מסמך… ${progress}%` : "סריקת מסמך ומילוי פרטים"}
            </button>
            <span className="muted">הסריקה מתבצעת במכשיר. יש לבדוק את הפרטים לפני השמירה.</span>
            {ocrError && <p className="message error" role="alert">{ocrError}</p>}
            {ocrFields && <p className="message success" role="status">הפרטים זוהו. בדקו אותם לפני השמירה.</p>}
          </div>
        )}
      </>
      <div className="form-grid">
        <label>
          סטטוס תשלום
          <select
            name="payment_status"
            defaultValue={expense?.payment_status ?? "paid"}
          >
            {Object.entries(paymentStatuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          שלב בפרויקט
          <select
            name="stage"
            defaultValue={expense?.stage ?? "construction"}
          >
            {Object.entries(stages).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-grid">
        <label>
          מועד לתשלום (אם רלוונטי)
          <input
            name="due_on"
            type="date"
            defaultValue={expense?.due_on ?? ""}
          />
        </label>
        <label>
          מספר שובר / חשבונית / תיק
          <input
            name="reference"
            maxLength={160}
            defaultValue={expense?.reference}
            placeholder="מספר אסמכתה"
          />
        </label>
      </div>
      <label>
        הערה <span className="muted">(לא חובה)</span>
        <textarea
          name="notes"
          ref={notesRef}
          placeholder="פירוט העבודה, השומה או דרישת התשלום…"
          maxLength={2000}
          defaultValue={expense?.notes}
        />
      </label>
      <FormStatus state={state} />
      <button className="primary" disabled={pending}>
        {pending ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <Plus size={18} />
        )}{" "}
        {pending
          ? "שומרים…"
          : expense
            ? "שמירת שינויים"
            : "שמירת הוצאה"}
      </button>
    </form>
  );
}
