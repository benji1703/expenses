"use client";
import { stages, paymentStatuses } from "@/lib/renovation-guide";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
  Plus,
  X,
  UploadCloud,
  LoaderCircle,
  Pencil,
  Trash2,
  ScanText,
} from "lucide-react";
import {
  login,
  saveExpense,
  inviteMember,
  toggleMember,
  deleteExpense,
  setMemberRole,
  type ActionState,
} from "@/app/actions";
import type { Category, Expense } from "@/lib/expenses";
import { useReceiptOcr } from "@/components/use-receipt-ocr";
const initial: ActionState = {};
function Status({ state }: { state: ActionState }) {
  return (
    <>
      {state.error && (
        <p className="message error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="message success" role="status">
          {state.success}
        </p>
      )}
    </>
  );
}
export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get("access_token"),
      refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;
    // Supabase's default invitation emails use an implicit callback. Consume it and
    // immediately erase the URL fragment; custom token-hash emails use the server route.
    window.history.replaceState(null, "", "/login");
    const client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    void client.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (!error) {
          router.replace("/");
          router.refresh();
        }
      });
  }, [router]);
  return (
    <form action={action} className="stack">
      <label>
        כתובת אימייל
        <input
          name="email"
          type="email"
          placeholder="you@gmail.com"
          required
          autoComplete="email"
          maxLength={254}
        />
      </label>
      <button className="primary" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={18} /> : null}
        {pending ? "שולחים קישור…" : "שלחו לי קישור כניסה"}
      </button>
      <Status state={state} />
    </form>
  );
}
export function ExpenseForm({
  categories,
  expense,
}: {
  categories: Category[];
  expense?: Expense;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveExpense, initial);
  const [file, setFile] = useState("");
  const { scan, processing: scanning, progress, error: ocrError, fields: ocrFields } = useReceiptOcr();
  const merchantRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (state.success) {
      dialog.current?.close();
    }
  }, [state]);
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
        {expense ? (
          <Pencil size={15} />
        ) : (
          <>
            <Plus size={18} />
            הוספת הוצאה
          </>
        )}
      </button>
      <dialog
        ref={dialog}
        className="expense-dialog"
        onClose={() => {
          setOpen(false);
          setFile("");
        }}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
      >
        {open && (
          <>
            <div className="dialog-header">
              <div>
                <p className="eyebrow">משק 48 · בית חנניה</p>
                <h2>{expense ? "עריכת הוצאה" : "הוצאה חדשה למשק 48"}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => dialog.current?.close()}
                aria-label="סגירה"
              >
                <X size={20} />
              </button>
            </div>
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
              {!expense && (
                <>
                <label className="upload">
                  <UploadCloud size={27} />
                  <strong>
                    {file || "צירוף חשבונית, קבלה או דרישת תשלום"}
                  </strong>
                  <span>PDF, JPG או PNG · עד 10 MB · לא חובה</span>
                  <input
                    name="receipt"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(e) => setFile(e.target.files?.[0]?.name ?? "")}
                  />
                </label>
                {file && (
                  <div className="ocr-controls">
                    <button
                      type="button"
                      className="secondary"
                      disabled={scanning || pending}
                      onClick={async () => {
                        const receipt = document.querySelector<HTMLInputElement>('input[name="receipt"]')?.files?.[0];
                        if (!receipt) return;
                        try {
                          const extracted = await scan(receipt);
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
              )}
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
              <Status state={state} />
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
          </>
        )}
      </dialog>
    </>
  );
}
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
      <Status state={state} />
    </form>
  );
}
export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, initial);
  return (
    <form action={action} className="stack">
      <label>
        הזמנת חבר לפרויקט
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
          <option value="member">צפייה ועריכת הוצאות</option>
          <option value="read_only">צפייה בלבד</option>
        </select>
      </label>
      <button className="secondary" disabled={pending}>
        {pending ? "שולחים…" : "שליחת הזמנה"}
      </button>
      <Status state={state} />
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
              <option value="member">צפייה ועריכת הוצאות</option>
              <option value="read_only">צפייה בלבד</option>
            </select>
          </label>
          <button className="secondary" disabled={rolePending}>
            {rolePending ? "שומרים…" : "עדכון הרשאה"}
          </button>
          <Status state={roleState} />
        </form>
        <form action={action}>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="active" value={String(!active)} />
          <button className="text-button" disabled={pending}>
            {active ? "ביטול גישה" : "החזרת גישה"}
          </button>
          <Status state={state} />
        </form>
      </div>
    </details>
  );
}
