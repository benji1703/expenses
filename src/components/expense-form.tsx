"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import type { Category, Expense } from "@/lib/expenses";
import ExpenseFields from "@/components/expense-fields";
import { outsideDialog } from "@/lib/dialog-dismiss";

// Keep the small editor available as soon as the page loads. OCR/PDF engines
// remain lazy; opening the form must never require a working connection.
export function ExpenseForm({ categories, merchants, expense }: { categories: Category[]; merchants?: string[]; expense?: Expense }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const saved = useCallback(() => {
    dirty.current = false;
    dialog.current?.close();
  }, []);
  function dismiss() {
    if (saving) return;
    if (dirty.current && !window.confirm("לסגור בלי לשמור את השינויים?")) return;
    dirty.current = false;
    dialog.current?.close();
  }

  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);

  return (
    <>
      <button
        className={expense ? "icon-button" : "primary"}
        onClick={() => { dirty.current = false; setOpen(true); }}
        aria-label={expense ? `עריכת ${expense.merchant}` : undefined}
      >
        {expense ? <Pencil size={15} /> : <><Plus size={18} /> הוספת הוצאה</>}
      </button>
      <dialog
        ref={dialog}
        className="expense-dialog"
        aria-label={expense ? "עריכת הוצאה" : "הוצאה חדשה"}
        onClose={() => { setOpen(false); setSaving(false); }}
        onCancel={(event) => { event.preventDefault(); dismiss(); }}
        onInput={() => { dirty.current = true; }}
        onChange={() => { dirty.current = true; }}
        onClick={(event) => {
          if (event.target === dialog.current && outsideDialog(dialog.current.getBoundingClientRect(), event.clientX, event.clientY)) dismiss();
        }}
      >
        {open && <>
          <div className="dialog-header">
            <div>
              <h2>{expense ? "עריכת הוצאה" : "הוצאה חדשה"}</h2>
            </div>
            <button type="button" className="icon-button" disabled={saving} aria-label="סגירה" onClick={dismiss}><X size={20} /></button>
          </div>
          <ExpenseFields categories={categories} merchants={merchants} expense={expense} onSaved={saved} onDirty={() => { dirty.current = true; }} onPendingChange={setSaving} />
        </>}
      </dialog>
    </>
  );
}
