"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import type { Category, Expense } from "@/lib/expenses";
import ExpenseFields from "@/components/expense-fields";

// Keep the small editor available as soon as the page loads. OCR/PDF engines
// remain lazy; opening the form must never require a working connection.
export function ExpenseForm({ categories, merchants, expense }: { categories: Category[]; merchants?: string[]; expense?: Expense }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const saved = useCallback(() => {
    dialog.current?.close();
  }, []);

  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);

  return (
    <>
      <button
        className={expense ? "icon-button" : "primary"}
        onClick={() => setOpen(true)}
        aria-label={expense ? `עריכת ${expense.merchant}` : undefined}
      >
        {expense ? <Pencil size={15} /> : <><Plus size={18} /> הוספת הוצאה</>}
      </button>
      <dialog
        ref={dialog}
        className="expense-dialog"
        aria-label={expense ? "עריכת הוצאה" : "הוצאה חדשה"}
        onClose={() => setOpen(false)}
        onClick={(event) => { if (event.target === dialog.current) dialog.current.close(); }}
      >
        {open && <>
          <div className="dialog-header">
            <div>
              <h2>{expense ? "עריכת הוצאה" : "הוצאה חדשה"}</h2>
            </div>
            <button type="button" className="icon-button" aria-label="סגירה" onClick={() => dialog.current?.close()}><X size={20} /></button>
          </div>
          <ExpenseFields categories={categories} merchants={merchants} expense={expense} onSaved={saved} />
        </>}
      </dialog>
    </>
  );
}
