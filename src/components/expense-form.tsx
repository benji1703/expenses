"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Pencil, Plus, X } from "lucide-react";
import type { Category, Expense } from "@/lib/expenses";

const ExpenseFields = dynamic(() => import("./expense-fields"), {
  ssr: false,
  loading: () => <p className="muted" role="status"><LoaderCircle className="spin" size={18} /> טוען את הטופס…</p>,
});

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
        aria-label={expense ? "עריכת הוצאה" : "הוצאה חדשה למשק 48"}
        onClose={() => setOpen(false)}
        onClick={(event) => { if (event.target === dialog.current) dialog.current.close(); }}
      >
        {open && <>
          <div className="dialog-header">
            <div>
              <p className="eyebrow">משק 48 · בית חנניה</p>
              <h2>{expense ? "עריכת הוצאה" : "הוצאה חדשה למשק 48"}</h2>
            </div>
            <button type="button" className="icon-button" aria-label="סגירה" onClick={() => dialog.current?.close()}><X size={20} /></button>
          </div>
          <ExpenseFields categories={categories} merchants={merchants} expense={expense} onSaved={saved} />
        </>}
      </dialog>
    </>
  );
}
