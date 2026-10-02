"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowUpRight, Paperclip } from "lucide-react";
import { ExpenseForm } from "@/components/expense-form";
import { DeleteExpense } from "@/components/forms";
import { money, type Category, type Expense, type ExpenseReceipt } from "@/lib/expenses";
import { stages, paymentStatuses } from "@/lib/renovation-guide";
import type { OfflineRole } from "@/lib/offline-types";
import type { PendingExpense } from "@/lib/offline-types";
import { activeProfile, listDrafts, offlineChanged } from "@/lib/offline-store";
import { isDisconnected, subscribeConnection } from "@/lib/connection-state";
import { filterLocalLedger, localLedger } from "@/lib/local-ledger";

export function ExpenseTable({ expenses, categories, receiptsByExpense, role, owner, offline = false, emptyState }: {
  expenses: Expense[]; categories: Category[];
  receiptsByExpense?: Map<string, Pick<ExpenseReceipt, "id" | "expense_id">[]>;
  role: OfflineRole; owner: string; offline?: boolean;
  emptyState?: ReactNode;
}) {
  const disconnected = useSyncExternalStore(subscribeConnection, isDisconnected, () => false);
  const [drafts, setDrafts] = useState<PendingExpense[]>([]);
  const [address, setAddress] = useState<string>();
  useEffect(() => {
    let current = true;
    const load = async () => {
      try {
        const profile = await activeProfile();
        const pending = profile?.id === owner ? await listDrafts(owner) : [];
        if (current) { setDrafts(pending); setAddress(location.href); }
      } catch { /* The editor reports storage failures without losing its form. */ }
    };
    void load(); window.addEventListener(offlineChanged, load);
    return () => { current = false; window.removeEventListener(offlineChanged, load); };
  }, [owner, expenses]);
  const rows = address ? filterLocalLedger(localLedger(expenses, drafts), new URL(address)) : expenses;
  const pendingIds = new Set(drafts.map((draft) => draft.expense_id));
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const merchants = [...new Set(expenses.map((expense) => expense.merchant))];
  const canWrite = role !== "read_only";
  return (
    <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ספק / רשות</th>
                  <th>קטגוריה</th>
                  <th>תאריך</th>
                  <th>סטטוס</th>
                  <th>אסמכתה</th>
                  <th className="align-right">סכום</th>
                  <th>
                    <span className="sr-only">פעולות</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const category = categoryMap.get(e.category_id);
                  return (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.merchant}</strong>
                        {pendingIds.has(e.id) && <small className="expense-note">ממתין לסנכרון</small>}
                        <small className="expense-note">
                          {stages[e.stage]}
                          {e.reference ? ` · ${e.reference}` : ""}
                        </small>
                        {e.notes && (
                          <small className="expense-note" title={e.notes}>
                            {e.notes}
                          </small>
                        )}
                      </td>
                      <td>
                        <span className="category-badge">
                          <span style={{ background: category?.color }} />
                          {category?.name}
                        </span>
                      </td>
                      <td className="date-cell">
                        {new Date(`${e.spent_on}T12:00:00Z`).toLocaleDateString(
                          "he-IL",
                          { month: "short", day: "numeric" },
                        )}
                      </td>
                      <td>
                        <span className={`payment-badge ${e.payment_status}`}>
                          {paymentStatuses[e.payment_status]}
                        </span>
                        {e.due_on && (
                          <small className="expense-note">
                            לתשלום עד{" "}
                            {new Date(
                              `${e.due_on}T12:00:00Z`,
                            ).toLocaleDateString("he-IL")}
                          </small>
                        )}
                      </td>
                      <td>
                        {(offline || disconnected) && (e.receipt_path || receiptsByExpense?.get(e.id)?.length) ? <span className="muted">נדרש חיבור</span> : (receiptsByExpense?.get(e.id)?.length ?? 0) > 0 ? (
                          <div className="stack" style={{ gap: 4 }}>
                            {receiptsByExpense?.get(e.id)!.map((receipt, index) => (
                              <a className="receipt-link" key={receipt.id} href={`/receipts/${e.id}/${receipt.id}`} target="_blank" rel="noopener noreferrer">
                                <Paperclip size={14} />
                                {`קובץ ${index + 1}`}
                                <ArrowUpRight size={13} />
                              </a>
                            ))}
                          </div>
                        ) : e.receipt_path ? (
                          <a className="receipt-link" href={`/receipts/${e.id}`} target="_blank" rel="noopener noreferrer">
                            <Paperclip size={14} /> הצגה <ArrowUpRight size={13} />
                          </a>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="align-right amount-cell">
                        {money(Number(e.amount), e.currency)}
                      </td>
                      <td>
                        {canWrite && !pendingIds.has(e.id) && (e.created_by === owner ||
                          role === "admin") && (
                          <div className="row-actions">
                            <ExpenseForm categories={categories} merchants={merchants} expense={e} />
                            {!offline && !disconnected && <DeleteExpense expense={e} />}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      {!rows.length && emptyState}
    </>
  );
}
