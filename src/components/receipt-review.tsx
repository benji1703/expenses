"use client";

import { useState } from "react";
import type { Category } from "@/lib/expenses";
import { documentTypes, parseReceiptAmount, type ReceiptFields } from "@/lib/receipt-ocr";
import { paymentStatuses } from "@/lib/renovation-guide";

export function ReceiptReview({ fields, categories, onApply }: {
  fields: ReceiptFields; categories: Category[]; onApply: (fields: ReceiptFields) => void;
}) {
  const [merchant, setMerchant] = useState(fields.merchant ?? "");
  const [amount, setAmount] = useState(fields.amount ?? "");
  const [applied, setApplied] = useState(false);
  const category = categories.find((item) => item.id === fields.category_id);
  const invalidAmount = amount.trim() !== "" && !parseReceiptAmount(amount);
  return <div className="ocr-review">
    <strong>בדיקת הפרטים שזוהו</strong>
    <dl className="ocr-summary">
      <div><dt>סוג מסמך</dt><dd>{fields.document_type ? documentTypes[fields.document_type] : "לא זוהה"}</dd></div>
      <div><dt>קטגוריה מוצעת</dt><dd>{category?.name ?? "בחרו קטגוריה בטופס"}</dd></div>
      {fields.spent_on && <div><dt>תאריך</dt><dd><bdi>{fields.spent_on}</bdi></dd></div>}
      {fields.reference && <div><dt>אסמכתה</dt><dd><bdi>{fields.reference}</bdi></dd></div>}
      {fields.payment_status && <div><dt>סטטוס מוצע</dt><dd>{paymentStatuses[fields.payment_status]}</dd></div>}
      {fields.due_on && <div><dt>מועד לתשלום</dt><dd><bdi>{fields.due_on}</bdi></dd></div>}
    </dl>
    <div className="form-grid">
      <label>ספק שזוהה<input aria-label="ספק שזוהה" value={merchant} maxLength={160} placeholder="הספק לא זוהה" onChange={(event) => { setMerchant(event.target.value); setApplied(false); }} /></label>
      <label>סכום סופי {fields.currency && `· ${fields.currency}`}<input aria-label="סכום שזוהה" inputMode="decimal" dir="ltr" value={amount} placeholder="הסכום לא זוהה" onChange={(event) => { setAmount(event.target.value); setApplied(false); }} /></label>
    </div>
    {fields.amount_candidates.length > 0 && <label>סכומים אפשריים מהמסמך<select aria-label="בחירת סכום מהמסמך" value={fields.amount_candidates.includes(amount) ? amount : ""} onChange={(event) => { setAmount(event.target.value); setApplied(false); }}>
      <option value="" disabled>בחרו סכום לאחר בדיקה</option>
      {fields.amount_candidates.map((value) => <option key={value} value={value}>{value}</option>)}
    </select></label>}
    {fields.warnings.map((warning) => <p className="ocr-warning" key={warning}>{warning}</p>)}
    {invalidAmount && <p className="message error" role="alert">הזינו סכום תקין, גדול מאפס.</p>}
    <button type="button" className="secondary" disabled={!!invalidAmount} onClick={() => {
      onApply({ ...fields, merchant: merchant.trim() || undefined, amount: parseReceiptAmount(amount) });
      setApplied(true);
    }}>החלת הפרטים בטופס</button>
    {applied && <p className="message success" role="status">הפרטים הועברו לטופס. אפשר לערוך אותם לפני השמירה.</p>}
  </div>;
}
