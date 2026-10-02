"use client";
import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import {
  deleteExpense,
  type ActionState,
} from "@/app/actions";
import type { Expense } from "@/lib/expenses";
import { FormStatus } from "@/components/form-status";

const initial: ActionState = {};
export function DeleteExpense({ expense }: { expense: Expense }) {
  const [state, action, pending] = useActionState(deleteExpense, initial);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `למחוק את ההוצאה של ${expense.merchant} ואת האסמכתה שלה?`,
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={expense.id} />
      <button
        className="icon-button"
        disabled={pending}
        aria-label={`מחיקת ${expense.merchant}`}
      >
        <Trash2 size={15} />
      </button>
      <FormStatus state={state} />
    </form>
  );
}
