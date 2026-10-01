"use client";
import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import {
  inviteMember,
  toggleMember,
  deleteExpense,
  setMemberRole,
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
export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, initial);
  return (
    <form action={action} className="stack">
      <label>
        הזמנה או שליחה מחדש
        <input
          name="email"
          type="email"
          placeholder="כתובת האימייל שלהם"
          required
        />
      </label>
      <label>
        הרשאת גישה
        <select name="role" defaultValue="member">
          <option value="admin">מנהל</option>
          <option value="member">צפייה ועריכת הוצאות</option>
          <option value="read_only">צפייה בלבד</option>
        </select>
      </label>
      <button className="secondary" disabled={pending}>
        {pending ? "שולחים…" : "שליחת קישור כניסה"}
      </button>
      <small className="muted">לכתובת שכבר קיימת בפרויקט, ההרשאה תעודכן והקישור יישלח מחדש.</small>
      <FormStatus state={state} />
    </form>
  );
}
export function MemberAccess({
  email,
  active,
  role,
}: {
  email: string;
  active: boolean;
  role: "member" | "read_only";
}) {
  const [state, action, pending] = useActionState(toggleMember, initial);
  const [roleState, roleAction, rolePending] = useActionState(setMemberRole, initial);
  return (
    <details className="member-controls">
      <summary>ניהול גישה</summary>
      <div className="member-control-content">
        <form action={roleAction} className="member-role-form">
          <input type="hidden" name="email" value={email} />
          <label>
            סוג משתמש
            <select name="role" defaultValue={role}>
              <option value="admin">מנהל</option>
              <option value="member">צפייה ועריכת הוצאות</option>
              <option value="read_only">צפייה בלבד</option>
            </select>
          </label>
          <button className="secondary" disabled={rolePending}>
            {rolePending ? "שומרים…" : "עדכון הרשאה"}
          </button>
          <FormStatus state={roleState} />
        </form>
        <form action={action}>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="active" value={String(!active)} />
          <button className="text-button" disabled={pending}>
            {active ? "ביטול גישה" : "החזרת גישה"}
          </button>
          <FormStatus state={state} />
        </form>
      </div>
    </details>
  );
}
