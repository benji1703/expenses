"use client";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LoaderCircle, Plus, ScanText, UploadCloud, X } from "lucide-react";
import { saveCategory, type ActionState } from "@/app/actions";
import { stages, paymentStatuses } from "@/lib/renovation-guide";
import type { Category, Expense } from "@/lib/expenses";
import { useReceiptOcr } from "@/components/use-receipt-ocr";
import { queueExpense } from "@/lib/offline-sync";
import { ReceiptReview } from "@/components/receipt-review";
import type { ReceiptFields } from "@/lib/receipt-ocr";
import { FormStatus } from "@/components/form-status";
import { localDateInputValue } from "@/lib/dialog-dismiss";
import { receiptAutofill, receiptFormFields, mergeReceiptFiles } from "@/lib/receipt-entry";
import { isDisconnected, subscribeConnection } from "@/lib/connection-state";
import { cacheCreatedCategory } from "@/lib/offline-store";

const initial: ActionState = {};

export default function ExpenseFields({ categories, merchants = [], expense, canManageCategories = false, onSaved, onDirty, onPendingChange }: {
  categories: Category[];
  merchants?: string[];
  expense?: Expense;
  canManageCategories?: boolean;
  onSaved: () => void;
  onDirty?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [state, action, pending] = useActionState(async (_previous: ActionState, form: FormData): Promise<ActionState> => {
    try {
      form.delete("receipts");
      for (const file of files) form.append("receipts", file);
      return { success: await queueExpense(form, expense) };
    }
    catch (cause) { return { error: cause instanceof Error ? cause.message : "לא ניתן לשמור במכשיר. הטופס נשאר פתוח." }; }
  }, initial);
  const [fileError, setFileError] = useState("");
  const [addedCategories, setAddedCategories] = useState<Category[]>([]);
  const [categoryState, setCategoryState] = useState<ActionState>({});
  const [creatingCategory, setCreatingCategory] = useState(false);
  const categoryName = useRef<HTMLInputElement>(null);
  const categoryDetails = useRef<HTMLDetailsElement>(null);
  const allCategories = [...categories, ...addedCategories.filter((item) => !categories.some((category) => category.id === item.id))];
  const disconnected = useSyncExternalStore(subscribeConnection, isDisconnected, () => false);
  const edited = useRef(new Set<string>(expense ? receiptFormFields : []));
  const { scan, cancel, processing: scanning, progress, status, error: ocrError, results, reset } = useReceiptOcr();
  const [selectedScan, setSelectedScan] = useState(0);
  const lastApplied = useRef<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state.success) onSaved();
  }, [state.success, onSaved]);
  useEffect(() => { onPendingChange?.(pending || creatingCategory); }, [pending, creatingCategory, onPendingChange]);
  useEffect(() => {
    const input = filesRef.current;
    const cancelPicker = (event: Event) => event.stopPropagation();
    input?.addEventListener("cancel", cancelPicker);
    return () => input?.removeEventListener("cancel", cancelPicker);
  }, []);

  function applyScan(fields: ReceiptFields, explicit = false) {
    const values: Record<string, string> = {};
    for (const name of receiptFormFields) {
      const element = formRef.current?.elements.namedItem(name);
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) values[name] = element.value;
    }
    const updates = receiptAutofill(fields, values, lastApplied.current, explicit ? new Set() : edited.current);
    for (const [name, value] of Object.entries(updates)) {
      const element = formRef.current?.elements.namedItem(name);
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) element.value = value;
    }
    lastApplied.current = { ...lastApplied.current, ...updates };
    if (Object.keys(updates).length) onDirty?.();
  }

  async function scanFiles(receipts: File[], fresh = false) {
    const selectedFile = files[selectedScan];
    const scanned = await scan(receipts, { categories: allCategories, merchants: [...merchants, ...(expense ? [expense.merchant] : [])] }, fresh);
    const first = scanned.findIndex((item) => item.fields);
    const preferred = selectedFile ? receipts.indexOf(selectedFile) : -1;
    const chosen = preferred >= 0 && scanned[preferred]?.fields ? preferred : first;
    setSelectedScan(Math.max(0, chosen));
    if (chosen >= 0) applyScan(scanned[chosen].fields!);
  }

  async function addCategory() {
    if (creatingCategory || disconnected || !canManageCategories) return;
    const name = categoryName.current?.value.trim() ?? "";
    if (!name) { setCategoryState({ error: "הזינו שם קטגוריה." }); categoryName.current?.focus(); return; }
    setCreatingCategory(true); setCategoryState({});
    try {
      const data = new FormData(); data.set("name", name); data.set("color", "#9b8c7c");
      const result = await saveCategory({}, data);
      setCategoryState(result);
      if (result.category) {
        setAddedCategories((previous) => [...previous, result.category!]);
        await cacheCreatedCategory(result.category).catch(() => {});
        // Wait for the new option to mount before selecting it.
        requestAnimationFrame(() => {
          const select = formRef.current?.elements.namedItem("category_id");
          if (select instanceof HTMLSelectElement) select.value = result.category!.id;
        });
        edited.current.add("category_id"); onDirty?.();
        if (categoryDetails.current) categoryDetails.current.open = false;
      }
    } catch { setCategoryState({ error: "יצירת הקטגוריה נכשלה. נסו שוב." }); }
    finally { setCreatingCategory(false); }
  }
  const selected = results[selectedScan];

  return (
    <form data-offline-safe="true" ref={formRef} action={action} className="stack expense-entry" key={expense?.id ?? "new"} onChange={(event) => {
      const target = event.target;
      if ((target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) && target.name !== "receipts") edited.current.add(target.name);
    }}>
      {expense && <input type="hidden" name="id" value={expense.id} />}
      <section className="receipt-entry" aria-label="מסמכים להוצאה">
        <div className="receipt-entry-header"><span><UploadCloud size={20} />מסמכים <small>(לא חובה)</small></span><button type="button" className="secondary" disabled={pending || scanning || creatingCategory} onClick={() => filesRef.current?.click()}>{files.length ? "צירוף קבצים נוספים" : "צירוף קבלה או חשבונית"}</button></div>
        <input ref={filesRef} className="receipt-file-input" name="receipts" type="file" accept="application/pdf,image/jpeg,image/png" multiple tabIndex={-1} aria-label="בחירת מסמכים" disabled={pending || scanning || creatingCategory}
          onChange={(event) => {
            const incoming = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (!incoming.length) return;
            try {
              const next = mergeReceiptFiles(files, incoming);
              if (next.length === files.length) return;
              setFiles(next); setFileError(""); reset(); setSelectedScan(0); onDirty?.();
              void scanFiles(next);
            } catch (cause) { setFileError(cause instanceof Error ? cause.message : "לא ניתן לצרף את הקובץ."); }
          }} />
        <p className="receipt-limit">PDF, JPG או PNG · עד 10 קבצים, 10 MB בסך הכול</p>
        {files.length > 0 && <ul className="receipt-files">{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><bdi>{file.name}</bdi><button type="button" className="icon-button" aria-label={`הסרת ${file.name}`} disabled={pending || scanning || creatingCategory} onClick={() => { setFiles(files.filter((_, item) => item !== index)); reset(); setSelectedScan(0); onDirty?.(); }}><X size={17} /></button></li>)}</ul>}
        {scanning && <div className="receipt-progress" role="status"><LoaderCircle className="spin" size={17} /><span>{status} {progress}%</span><button type="button" className="text-button" onClick={cancel}>ביטול סריקה</button></div>}
        {fileError && <p className="message error" role="alert">{fileError}</p>}
        {ocrError && <p className="message error" role="alert">{ocrError}</p>}
        {!scanning && results.length > 0 && <div className="receipt-result">
          {results.length > 1 && <label>מסמך למילוי הפרטים<select value={selectedScan} disabled={pending} onChange={(event) => { const index = Number(event.target.value); setSelectedScan(index); if (results[index]?.fields) applyScan(results[index].fields!); }}>
            {results.map((item, index) => <option key={index} value={index}>{item.file_name}{item.error ? " · לא זוהה" : ""}</option>)}
          </select><span className="muted">הסכומים אינם מתחברים אוטומטית.</span></label>}
          {selected?.error && <p className="message error" role="alert">{selected.error}</p>}
          {selected?.fields && <><ReceiptReview key={`${selectedScan}-${selected.file_name}`} fields={selected.fields} disabled={pending || creatingCategory} onSelectAmount={(amount) => {
            const input = formRef.current?.elements.namedItem("amount");
            if (input instanceof HTMLInputElement) { input.value = amount; edited.current.add("amount"); onDirty?.(); }
          }} onSelectMerchant={(merchant) => {
            const input = formRef.current?.elements.namedItem("merchant");
            if (input instanceof HTMLInputElement) {
              input.value = merchant; edited.current.add("merchant"); onDirty?.();
            }
          }} />{expense && <button type="button" className="text-button" disabled={pending} onClick={() => {
            if (confirm("להחליף את פרטי ההוצאה בפרטים שזוהו במסמך?")) applyScan(selected.fields!, true);
          }}>מילוי הפרטים מהמסמך</button>}</>}
        </div>}
        {!scanning && files.length > 0 && <button type="button" className="text-button" disabled={pending} onClick={() => void scanFiles(files, true)}><ScanText size={15} />סריקה מחדש</button>}
      </section>
      <label>
        ספק / קבלן / רשות
        <input
          name="merchant"
          disabled={pending}
          placeholder="למשל: רמ״י, אדריכל או קבלן"
          defaultValue={expense?.merchant}
          required
          maxLength={160}
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
            {allCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {canManageCategories && <details className="expense-category-create" ref={categoryDetails}>
        <summary>לא מצאתם קטגוריה? הוספת קטגוריה</summary>
        <div className="inline-category-fields"><label>שם קטגוריה<input ref={categoryName} maxLength={60} disabled={creatingCategory || pending || disconnected} placeholder="שם הקטגוריה" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addCategory(); } }} /></label><button type="button" className="secondary" disabled={creatingCategory || pending || disconnected} onClick={() => void addCategory()}>{creatingCategory ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />}הוספה</button></div>
        {disconnected && <p className="muted">יצירת קטגוריה דורשת חיבור.</p>}
        {categoryState.error && <p className="message error" role="alert">{categoryState.error}</p>}
      </details>}
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


      <details className="expense-extra-fields"><summary>פרטים נוספים</summary><div className="stack">
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
      </div></details>
      <FormStatus state={state} />
      <button className="primary" disabled={pending || scanning || creatingCategory}>
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
