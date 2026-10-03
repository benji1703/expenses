import { z } from "zod";

/** Wire contract for the single expense-write path, including offline replay. */
export const expenseReplaySchema = z.object({
  owner: z.uuid(), operation_id: z.uuid(), expense_id: z.uuid(), editing: z.boolean(),
  expected_updated_at: z.iso.datetime({ offset: true }).nullable(),
  fields: z.record(z.string(), z.string()),
  files: z.array(z.object({ id: z.uuid(), path: z.string().max(200), type: z.enum(["application/pdf", "image/jpeg", "image/png"]) })).max(10),
}).refine((payload) => new Set(payload.files.map((file) => file.id)).size === payload.files.length,
  { message: "אותו קובץ מופיע יותר מפעם אחת.", path: ["files"] });

export type ExpenseReplay = z.infer<typeof expenseReplaySchema>;
