"use client";

import type { ReceiptFields } from "@/lib/receipt-ocr";
import { documentTypes } from "@/lib/receipt-ocr";
import { useState } from "react";

export function ReceiptReview({ fields, onSelectAmount, onSelectMerchant, disabled = false }: {
  fields: ReceiptFields;
  onSelectAmount: (amount: string) => void;
  onSelectMerchant: (merchant: string) => void;
  disabled?: boolean;
}) {
  const [confirmation, setConfirmation] = useState("");
  const amounts = fields.amount_alternatives ?? fields.amount_candidates;
  const merchants = fields.merchant_candidates ?? [];
  function selectAmount(amount: string) { onSelectAmount(amount); setConfirmation("הסכום עודכן"); }
  function selectMerchant(merchant: string) { onSelectMerchant(merchant); setConfirmation("שם הספק עודכן"); }
  return <div className="receipt-check">
    <p className="muted">{fields.document_type ? documentTypes[fields.document_type] : "מסמך מצורף"} · בדקו את הפרטים שמולאו בטופס.</p>
    {fields.amount_candidates.length > 0 && <div className="receipt-candidates"><span>בחרו סכום לפי המסמך</span>{fields.amount_candidates.map((amount) => <button className="secondary" type="button" disabled={disabled} key={amount} aria-label={`בחירת סכום ${amount}`} onClick={() => selectAmount(amount)}><bdi>{amount}</bdi></button>)}</div>}
    {(amounts.length > 1 && !fields.amount_candidates.length || merchants.length > 1) && <details className="receipt-alternatives">
      <summary>בחירת ערך אחר מהמסמך</summary>
      {amounts.length > 1 && !fields.amount_candidates.length && <div className="receipt-candidates"><span>סכומים מהמסמך</span>{amounts.map((amount) => <button className="secondary" type="button" disabled={disabled} key={amount} aria-label={`בחירת סכום ${amount}`} onClick={() => selectAmount(amount)}><bdi>{amount}</bdi></button>)}</div>}
      {merchants.length > 1 && <div className="receipt-candidates receipt-merchant-candidates"><span>שמות ספק אפשריים</span>{merchants.map((merchant) => <button className="secondary" type="button" disabled={disabled} key={merchant} aria-label={`בחירת ספק ${merchant}`} onClick={() => selectMerchant(merchant)}>{merchant}</button>)}</div>}
    </details>}
    {confirmation && <p className="muted" role="status">{confirmation}</p>}
    {fields.warnings.map((warning) => <p className="ocr-warning" key={warning}>{warning}</p>)}
  </div>;
}
