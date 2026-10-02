import type { stages, paymentStatuses } from "./renovation-guide.ts";
import { z } from "zod";
export const expenseSchema = z.object({
  merchant: z.string().trim().min(1, "הזינו ספק או רשות").max(160),
  amount: z
    .string()
    .regex(
      /^\d{1,8}(\.\d{1,2})?$/,
      "הזינו סכום חיובי עם עד שתי ספרות אחרי הנקודה",
    )
    .refine((v) => Number(v) > 0, "הסכום חייב להיות חיובי"),
  currency: z.enum(["ILS", "EUR", "USD", "GBP"]),
  payment_status: z.enum(["paid", "unpaid", "planned"]).default("paid"),
  due_on: z
    .union([z.iso.date(), z.literal("")])
    .optional()
    .transform((v) => v || null),
  reference: z.string().trim().max(160).default(""),
  stage: z
    .enum([
      "rights",
      "planning",
      "permits",
      "construction",
      "finishing",
      "infrastructure",
    ])
    .default("construction"),
  spent_on: z.iso.date(),
  category_id: z.uuid(),
  notes: z.string().trim().max(2000),
});
export function receiptExtension(
  bytes: Uint8Array,
  mime: string,
): "pdf" | "jpg" | "png" | null {
  if (
    mime === "application/pdf" &&
    new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
  )
    return "pdf";
  if (
    mime === "image/jpeg" &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "jpg";
  if (
    mime === "image/png" &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  )
    return "png";
  return null;
}
export type Category = { id: string; name: string; color: string };
export type Expense = {
  updated_at?: string;
  id: string;
  merchant: string;
  amount: number;
  currency: string;
  spent_on: string;
  notes: string;
  receipt_path: string | null;
  category_id: string;
  created_by: string;
  payment_status: keyof typeof paymentStatuses;
  due_on: string | null;
  reference: string;
  stage: keyof typeof stages;
};
export type ExpenseReceipt = { id: string; expense_id: string; path: string };
export function money(amount: number, currency: string) {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency }).format(
    amount,
  );
}
