"use client";

import { useState } from "react";
import type { PendingExpense } from "@/lib/offline-types";
import type { Expense } from "@/lib/expenses";
import { putDraft, recreateDraft } from "@/lib/offline-store";

export function DraftConflict({ draft, disabled }: { draft: PendingExpense; disabled: boolean }) {
  const [latest, setLatest] = useState<Expense | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  return <div className="draft-conflict">
    <button type="button" className="secondary" disabled={disabled || loading} onClick={async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/offline/expenses?expense_id=${draft.expense_id}`, { cache: "no-store" });
        const result = await response.json() as { expense?: Expense; error?: string };
        if (response.status === 409) setDeleted(true);
        if (!response.ok || !result.expense) throw new Error(result.error ?? "לא ניתן לטעון את ההוצאה.");
        setLatest(result.expense);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "אין חיבור לשירות."); }
      finally { setLoading(false); }
    }}>{loading ? "טוענים גרסה מעודכנת…" : "בדיקת הגרסה המעודכנת"}</button>
    {latest && <div className="draft-comparison">
      <strong>הגרסה במערכת</strong><p>{latest.merchant} · <bdi>{latest.amount} {latest.currency}</bdi> · {latest.spent_on}</p><p>{latest.notes || "ללא הערות"}</p>
      <strong>הטיוטה במכשיר</strong><p>{draft.fields.merchant} · <bdi>{draft.fields.amount} {draft.fields.currency}</bdi> · {draft.fields.spent_on}</p><p>{draft.fields.notes || "ללא הערות"}</p>
      <button type="button" className="secondary" disabled={disabled} onClick={async () => {
        await putDraft({ ...draft, editing: true, expected_updated_at: latest.updated_at ?? null, blocked: false, error: undefined, error_code: undefined });
      }}>שמירת הטיוטה במקום הגרסה המעודכנת</button>
    </div>}
    {deleted && <button type="button" className="secondary" disabled={disabled} onClick={() => recreateDraft(draft)}>יצירת הוצאה חדשה מהטיוטה</button>}
    {error && <p className="message error" role="alert">{error}</p>}
  </div>;
}
