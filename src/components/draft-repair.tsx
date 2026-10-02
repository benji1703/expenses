"use client";
import { useState } from "react";
import type { Category } from "@/lib/expenses";
import type { PendingExpense } from "@/lib/offline-types";
import { putDraft } from "@/lib/offline-store";

export function DraftRepair({ draft, disabled }: { draft: PendingExpense; disabled: boolean }) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [category, setCategory] = useState(draft.fields.category_id);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  return <div className="draft-conflict">
    <button type="button" className="secondary" disabled={disabled || loading} onClick={async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/offline/expenses?categories=1", { cache: "no-store" });
        const result = await response.json() as { categories?: Category[]; error?: string };
        if (!response.ok || !result.categories) throw new Error(result.error ?? "לא ניתן לטעון קטגוריות.");
        setCategories(result.categories);
        if (!result.categories.some((item) => item.id === category)) setCategory("");
      } catch (cause) { setError(cause instanceof Error ? cause.message : "אין חיבור."); }
      finally { setLoading(false); }
    }}>{loading ? "טוענים קטגוריות…" : "עדכון קטגוריית הטיוטה"}</button>
    {categories && <><label>קטגוריה עדכנית<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="" disabled>בחרו קטגוריה</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button type="button" className="secondary" disabled={disabled || !category} onClick={() => putDraft({ ...draft, fields: { ...draft.fields, category_id: category }, blocked: false, error: undefined, error_code: undefined })}>שמירת הקטגוריה וסנכרון</button></>}
    {error && <p role="alert" className="message error">{error}</p>}
  </div>;
}
