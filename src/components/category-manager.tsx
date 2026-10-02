"use client";

import { saveCategory, type ActionState } from "@/app/actions";
import type { Category } from "@/lib/expenses";
import { LoaderCircle, Pencil, Plus, Tags, X } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isDisconnected, subscribeConnection } from "@/lib/connection-state";

const initial: ActionState = {};

function CategoryDialog({
  category,
  onClose,
}: {
  category: Category | null;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(saveCategory, initial);
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    if (!state.success) return;
    dialog.current?.close();
    onClose();
    router.refresh();
  }, [state, onClose, router]);

  return (
    <dialog
      ref={dialog}
      className="expense-dialog category-dialog"
      aria-labelledby="category-dialog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current.close();
      }}
    >
      <div className="dialog-header">
        <div>
          <p className="eyebrow">קטגוריות הוצאות · משק 48</p>
          <h2 id="category-dialog-title">
            {category ? "עריכת קטגוריה" : "קטגוריה חדשה"}
          </h2>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="סגירה"
          onClick={() => dialog.current?.close()}
        >
          <X size={20} />
        </button>
      </div>
      <form action={action} className="stack">
        {category && <input type="hidden" name="id" value={category.id} />}
        <label>
          שם הקטגוריה
          <input
            name="name"
            required
            maxLength={60}
            defaultValue={category?.name ?? ""}
            placeholder="למשל: אדריכלות ותכנון"
            autoFocus
          />
        </label>
        <label>
          צבע לזיהוי
          <input
            className="category-color-input"
            name="color"
            type="color"
            defaultValue={category?.color ?? "#9b8c7c"}
            aria-label="צבע הקטגוריה"
          />
        </label>
        {state.error && <p className="message error" role="alert">{state.error}</p>}
        <button className="primary" disabled={pending}>
          {pending ? <LoaderCircle className="spin" size={18} /> : <Tags size={18} />}
          {pending ? "שומרים…" : category ? "שמירת שינויים" : "הוספת קטגוריה"}
        </button>
      </form>
    </dialog>
  );
}

export function CategoryManager({
  categories,
  canManage,
  offline = false,
}: {
  categories: Category[];
  canManage: boolean;
  offline?: boolean;
}) {
  const [editing, setEditing] = useState<Category | null | undefined>();
  const disconnected = useSyncExternalStore(subscribeConnection, isDisconnected, () => false);
  const unavailable = offline || disconnected;
  const close = () => setEditing(undefined);

  return (
    <section className="category-directory-section" aria-label="קטגוריות הוצאות">
      <div className="category-directory-heading">
        {canManage && (
          <button className="primary" disabled={unavailable} title={unavailable ? "נדרש חיבור" : undefined} onClick={() => setEditing(null)}>
            <Plus size={17} /> הוספת קטגוריה
          </button>
        )}
      </div>
      {categories.length ? (
        <div className="category-directory">
          {categories.map((category) => (
            <article className="category-admin-card" key={category.id}>
              <AppLink className="category-card-link" href={`/categories/${category.id}`}>
                <span className="legend-dot" style={{ background: category.color }} />
                <span>
                  <strong>{category.name}</strong>
                </span>
              </AppLink>
              {canManage && (
                <button
                  className="icon-button"
                  type="button"
                  disabled={unavailable}
                  title={unavailable ? "נדרש חיבור" : undefined}
                  aria-label={`עריכת הקטגוריה ${category.name}`}
                  onClick={() => setEditing(category)}
                >
                  <Pencil size={16} />
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state">עדיין אין קטגוריות בפרויקט.</p>
      )}
      {editing !== undefined && <CategoryDialog category={editing} onClose={close} />}
    </section>
  );
}
