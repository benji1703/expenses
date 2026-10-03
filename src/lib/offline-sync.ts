import { withRequestTimeout } from "./request-timeout.ts";
import { expenseSchema, receiptExtension, type Expense } from "./expenses";
import type { OfflineProfile, PendingExpense } from "./offline-types";
import type { ExpenseReplay } from "./expense-replay";
import { activeProfile, cacheSyncedExpense, listDrafts, offlineChanged, putDraft, removeDraft } from "./offline-store";

export async function queueExpense(form: FormData, expense?: Expense) {
  const profile = await activeProfile();
  if (!profile || profile.role === "read_only") throw new Error("אין הרשאה לשמור הוצאות במכשיר.");
  const parsed = expenseSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const files = form.getAll("receipts").filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length > 10 || files.reduce((size, item) => size + item.size, 0) > 10 * 1024 * 1024) throw new Error("בחרו עד 10 קבצים, עד 10 MB בסך הכול.");
  const operation = crypto.randomUUID();
  const id = expense?.id ?? operation;
  const attachments: PendingExpense["files"] = [];
  for (const file of files) {
    const extension = receiptExtension(new Uint8Array(await file.arrayBuffer()), file.type);
    if (!extension) throw new Error("אחד הקבצים אינו PDF, JPG או PNG תקין.");
    const attachmentId = crypto.randomUUID();
    attachments.push({ id: attachmentId, name: file.name, type: file.type, path: `${profile.id}/${id}/${attachmentId}.${extension}`, blob: file });
  }
  const fields = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [key, value ?? ""]));
  await putDraft({ operation_id: operation, expense_id: id, owner: profile.id, editing: !!expense,
    expected_updated_at: expense?.updated_at ?? null, fields, files: attachments, created_at: new Date().toISOString() });
  return "הטיוטה והקבצים נשמרו במכשיר. הם יסונכרנו כשהחיבור יהיה זמין.";
}

export type SyncReport = { pending: number; synced: number; connected: boolean; error?: string };
let running: Promise<SyncReport> | undefined;
export function syncDrafts(profile: OfflineProfile, onProgress?: (name: string) => void): Promise<SyncReport> {
  if (running) return running;
  const run = async (): Promise<SyncReport> => {
    let synced = 0;
    if (!navigator.onLine) return { pending: (await listDrafts(profile.id)).length, synced, connected: false };
    const drafts = await listDrafts(profile.id);
    for (const draft of drafts) {
      const active = await activeProfile();
      if (!active || active.id !== profile.id || active.role === "read_only") break;
      if (draft.blocked) continue;
      onProgress?.(draft.fields.merchant);
      try {
        if (draft.files.length) {
          const { access, identity } = await withRequestTimeout(async (signal) => {
            const access = await fetch("/api/offline/expenses", { cache: "no-store", signal });
            const identity = await access.json().catch((error) => { if (signal.aborted) throw error; return null; }) as { error?: string; profile?: { id: string } } | null;
            return { access, identity };
          }, 15_000);
          if (!access.ok || identity?.profile?.id !== profile.id) {
            const code = access.ok ? 403 : access.status;
            await putDraft({ ...draft, blocked: [401, 403].includes(code), error_code: code, error: identity?.error ?? "התחברו לחשבון ששמר את הטיוטה כדי לסנכרן." });
            return { pending: drafts.length - synced, synced, connected: code < 500, error: identity?.error };
          }
          const { createClient } = await import("./supabase/browser");
          const supabase = createClient();
          const { data: session, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !session.session?.access_token) {
            await putDraft({ ...draft, blocked: true, error_code: 401, error: "יש להתחבר מחדש כדי להעלות את הקבצים." });
            continue;
          }
          for (let index = 0; index < draft.files.length; index++) {
            const file = draft.files[index];
            onProgress?.(`${draft.fields.merchant} · קובץ ${index + 1}/${draft.files.length}`);
            const { uploaded, failure } = await withRequestTimeout(async (signal) => {
              const uploaded = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/receipts/${file.path}`, {
                method: "POST", body: file.blob, signal,
                headers: { "Content-Type": file.type, apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, Authorization: `Bearer ${session.session!.access_token}`, "x-upsert": "false" },
              });
              const failure = uploaded.ok ? null : await uploaded.json().catch((error) => { if (signal.aborted) throw error; return null; }) as { message?: string; error?: string; statusCode?: string } | null;
              return { uploaded, failure };
            }, 90_000);
            if (!uploaded.ok) {
              const authCode = [401, 403].includes(uploaded.status) ? uploaded.status : Number(failure?.statusCode);
              if ([401, 403].includes(authCode)) {
                const error = authCode === 401
                  ? "יש להתחבר מחדש כדי להעלות את הקבצים. הטיוטה נשארה במכשיר."
                  : "אין הרשאה להעלות קבצים. הטיוטה נשארה במכשיר; בדקו את הרשאות החשבון.";
                await putDraft({ ...draft, blocked: true, error_code: authCode, error });
                return { pending: (await listDrafts(profile.id)).length, synced, connected: true, error };
              }
              if (uploaded.status !== 409 && failure?.statusCode !== "409" && !/already exists|duplicate/i.test(failure?.message ?? failure?.error ?? "")) throw new Error("העלאת הקובץ לא הושלמה.");
            }
          }
          onProgress?.(draft.fields.merchant);
        }
        const { response, result } = await withRequestTimeout(async (signal) => {
          const response = await fetch("/api/offline/expenses", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ owner: draft.owner, operation_id: draft.operation_id, expense_id: draft.expense_id, editing: draft.editing,
              expected_updated_at: draft.expected_updated_at, fields: draft.fields,
              files: draft.files.map(({ id, path, type }) => ({ id, path, type: type as ExpenseReplay["files"][number]["type"] })) } satisfies ExpenseReplay),
            signal, cache: "no-store" });
          const result = await response.json().catch((error) => { if (signal.aborted) throw error; return null; }) as { error?: string; expense?: Expense } | null;
          return { response, result };
        }, 30_000);
        if (!response.ok || !result?.expense) {
          const blocked = [400, 401, 403, 409].includes(response.status);
          await putDraft({ ...draft, blocked, error_code: response.status, error: result?.error ?? "הסנכרון לא הושלם. הטיוטה נשארה במכשיר." });
          if (!blocked) return { pending: (await listDrafts(profile.id)).length, synced, connected: response.status < 500, error: result?.error };
          continue;
        }
        await cacheSyncedExpense(profile.id, result.expense);
        // Never discard local blobs until the server confirms expense AND receipt links.
        await removeDraft(draft.operation_id);
        synced++;
      } catch {
        // Network/expired upload sessions leave the draft intact for retry or sign-in.
        window.dispatchEvent(new Event(offlineChanged));
        return { pending: (await listDrafts(profile.id)).length, synced, connected: false, error: "אין חיבור לשירות. הטיוטות והקבצים נשארו במכשיר." };
      }
    }
    return { pending: (await listDrafts(profile.id)).length, synced, connected: true };
  };
  const locked = async () => navigator.locks ? await navigator.locks.request("meshek48-sync", run) : await run();
  running = locked().finally(() => { running = undefined; });
  return running;
}
