import type { ReceiptFields } from "./receipt-ocr.ts";

export const receiptFormFields = ["merchant", "amount", "spent_on", "currency", "category_id", "payment_status", "due_on", "reference"] as const;

export function receiptAutofill(fields: ReceiptFields, values: Record<string, string>, previous: Record<string, string>, edited: Set<string>) {
  const updates: Record<string, string> = {};
  for (const name of receiptFormFields) {
    if (edited.has(name)) continue;
    const value = fields[name];
    if (value) updates[name] = value;
    else if (name === "payment_status") updates[name] = "";
    else if (previous[name] !== undefined && previous[name] === values[name] && name !== "currency") updates[name] = "";
  }
  return updates;
}

export function mergeReceiptFiles(current: File[], incoming: File[]) {
  const files = [...current];
  for (const file of incoming) {
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) throw new Error("אפשר לצרף PDF, JPG או PNG בלבד.");
    if (!files.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified && item.type === file.type)) files.push(file);
  }
  if (files.length > 10 || files.reduce((sum, file) => sum + file.size, 0) > 10 * 1024 * 1024) throw new Error("אפשר לצרף עד 10 קבצים, עד 10 MB בסך הכול.");
  return files;
}
