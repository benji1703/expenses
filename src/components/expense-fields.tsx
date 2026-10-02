"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, ScanText, UploadCloud } from "lucide-react";
import { type ActionState } from "@/app/actions";
import { stages, paymentStatuses } from "@/lib/renovation-guide";
import type { Category, Expense } from "@/lib/expenses";
import { useReceiptOcr } from "@/components/use-receipt-ocr";
import { queueExpense } from "@/lib/offline-sync";
import { ReceiptReview } from "@/components/receipt-review";
import type { ReceiptFields } from "@/lib/receipt-ocr";
import { FormStatus } from "@/components/form-status";
import { localDateInputValue } from "@/lib/dialog-dismiss";

const initial: ActionState = {};

export default function ExpenseFields({ categories, merchants = [], expense, onSaved, onDirty, onPendingChange }: {
  categories: Category[];
  merchants?: string[];
  expense?: Expense;
  onSaved: () => void;
  onDirty?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [state, action, pending] = useActionState(async (_previous: ActionState, form: FormData): Promise<ActionState> => {
    try { return { success: await queueExpense(form, expense) }; }
    catch (cause) { return { error: cause instanceof Error ? cause.message : "לא ניתן לשמור במכשיר. הטופס נשאר פתוח." }; }
  }, initial);
  const [files, setFiles] = useState<string[]>([]);
  const { scan, processing: scanning, progress, status, error: ocrError, results, reset } = useReceiptOcr();
  const [selectedScan, setSelectedScan] = useState(0);
  const lastApplied = useRef<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state.success) onSaved();
  }, [state.success, onSaved]);
  useEffect(() => { onPendingChange?.(pending); }, [pending, onPendingChange]);

  function applyScan(fields: ReceiptFields) {
    onDirty?.();
    const next: Record<string, string> = {};
    for (const name of ["merchant", "amount", "spent_on", "currency", "category_id", "payment_status", "due_on", "reference", "notes"] as const) {
      const element = formRef.current?.elements.namedItem(name);
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
      const value = fields[name];
      // Switching documents clears earlier OCR values, while preserving manual edits.
      if (!value && lastApplied.current[name] === element.value) element.value = "";
      if (value && (name !== "notes" || !element.value.trim() || lastApplied.current[name] === element.value)) {
        element.value = value;
        next[name] = value;
      }
      if (name === "payment_status" && !value && !expense) element.value = "";
    }
    lastApplied.current = next;
  }
  const selected = results[selectedScan];

  return (
    <form data-offline-safe="true" ref={formRef} action={action} className="stack" key={expense?.id ?? "new"}>
      {expense && <input type="hidden" name="id" value={expense.id} />}
      <label>
        ספק / קבלן / רשות
        <input
          name="merchant"
          disabled={pending}
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
            disabled={pending}
            type="number"
            inputMode="decimal"
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
            disabled={pending}
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
            disabled={pending}
            type="date"
            required
            defaultValue={
              expense?.spent_on ??
              localDateInputValue()
            }
          />
        </label>
        <label>
          קטגוריה
          <select
            name="category_id"
            disabled={pending}
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
            disabled={scanning || pending}
            onChange={(e) => { setFiles(Array.from(e.target.files ?? []).map((item) => item.name)); reset(); setSelectedScan(0); }}
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
                const scanned = await scan(receipts, { categories, merchants: [...merchants, ...(expense ? [expense.merchant] : [])] });
                setSelectedScan(Math.max(0, scanned.findIndex((item) => item.fields)));
              }}
            >
              {scanning ? <LoaderCircle className="spin" size={17} /> : <ScanText size={17} />}
              {scanning ? `סורקים מסמך… ${progress}%` : "סריקת מסמכים לבדיקה"}
            </button>
            <span className="muted">הסריקה מתבצעת במכשיר. יש לבדוק את הפרטים לפני השמירה.</span>
            {ocrError && <p className="message error" role="alert">{ocrError}</p>}
            {scanning && <p className="muted" role="status">{status}</p>}
            {!scanning && results.length > 0 && <div className="ocr-results">
              {results.length > 1 && <label>בחירת מסמך למילוי ההוצאה<select value={selectedScan} onChange={(event) => setSelectedScan(Number(event.target.value))}>
                {results.map((item, index) => <option value={index} key={index}>{item.file_name}{item.error ? " · הסריקה נכשלה" : ""}</option>)}
              </select><span className="muted">כל קובץ נבדק בנפרד. הסכומים אינם מתחברים אוטומטית.</span></label>}
              <p className="ocr-file-name"><bdi>{selected?.file_name}</bdi></p>
              {selected?.error && <p className="message error" role="alert">{selected.error}</p>}
              {selected?.fields && <ReceiptReview key={`${selectedScan}-${selected.fields.notes}`} fields={selected.fields} categories={categories} onApply={applyScan} />}
            </div>}
          </div>
        )}
      </>
      <div className="form-grid">
        <label>
          סטטוס תשלום
          <select
            name="payment_status"
            disabled={pending}
            required
            defaultValue={expense?.payment_status ?? "paid"}
          >
            <option value="" disabled>בחרו סטטוס תשלום</option>
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
            disabled={pending}
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
            disabled={pending}
            type="date"
            defaultValue={expense?.due_on ?? ""}
          />
        </label>
        <label>
          מספר שובר / חשבונית / תיק
          <input
            name="reference"
            disabled={pending}
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
          disabled={pending}
          placeholder="פירוט העבודה, השומה או דרישת התשלום…"
          maxLength={2000}
          defaultValue={expense?.notes}
        />
      </label>
      <FormStatus state={state} />
      <button className="primary" disabled={pending || scanning}>
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
