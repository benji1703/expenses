"use client";

import type { ReceiptFields } from "@/lib/receipt-ocr";
import { documentTypes } from "@/lib/receipt-ocr";

export function ReceiptReview({ fields, onSelectAmount }: { fields: ReceiptFields; onSelectAmount: (amount: string) => void }) {
  return <div className="receipt-check">
    <p className="muted">{fields.document_type ? documentTypes[fields.document_type] : "מסמך מצורף"} · בדקו את הפרטים שמולאו בטופס.</p>
    {fields.amount_candidates.length > 0 && <div className="receipt-candidates"><span>בחרו סכום לפי המסמך</span>{fields.amount_candidates.map((amount) => <button className="secondary" type="button" key={amount} onClick={() => onSelectAmount(amount)}><bdi>{amount}</bdi></button>)}</div>}
    {fields.warnings.map((warning) => <p className="ocr-warning" key={warning}>{warning}</p>)}
  </div>;
}
