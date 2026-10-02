"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { CloudUpload, LoaderCircle, WifiOff } from "lucide-react";
import { isDisconnected, markConnection, subscribeConnection } from "@/lib/connection-state";
import { localNavigation, workspaceRefresh, workspaceRoute } from "@/lib/workspace-navigation";
import { DraftRepair } from "@/components/draft-repair";
import { DraftConflict } from "@/components/draft-conflict";
import { activeProfile, clearActiveProfile, listDrafts, offlineChanged, putDraft, removeDraft } from "@/lib/offline-store";
import type { PendingExpense } from "@/lib/offline-types";

export function OfflineRuntime() {
  const pathname = usePathname();
  const offline = useSyncExternalStore(subscribeConnection, isDisconnected, () => false);
  const [drafts, setDrafts] = useState<PendingExpense[]>([]);
  const [syncing, setSyncing] = useState("");
  const [actionError, setActionError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const syncingRef = useRef(false);
  const mounted = useRef(true);
  const check = useCallback(async (sync = false) => {
    try {
      const profile = await activeProfile();
      if (location.pathname === "/login" || location.pathname.startsWith("/auth/")) { setDrafts([]); return; }
      if (!mounted.current) return;
      const queued = profile ? await listDrafts(profile.id) : [];
      setDrafts(queued);
      if (navigator.onLine) setActionError("");
      if (!sync || !profile || syncingRef.current || !queued.some((item) => !item.blocked) || !navigator.onLine || profile.role === "read_only") return;
      syncingRef.current = true;
      try {
        const { syncDrafts } = await import("@/lib/offline-sync");
        const report = await syncDrafts(profile, (name) => { if (mounted.current) setSyncing(name); });
        if (!mounted.current) return;
        setDrafts(await listDrafts(profile.id));
        markConnection(report.connected);
        if (report.synced) window.dispatchEvent(new Event(workspaceRefresh));
      } finally { syncingRef.current = false; if (mounted.current) setSyncing(""); }
    } catch { if (mounted.current) setStorageError("שמירה במכשיר אינה זמינה בדפדפן הזה. אל תסגרו טופס שלא נשמר."); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const changed = () => { void check(true); };
    const visible = () => { if (document.visibilityState === "visible") void check(true); };
    const initialCheck = window.setTimeout(changed, 0);
    window.addEventListener("online", changed); window.addEventListener("offline", changed);
    window.addEventListener(offlineChanged, changed); window.addEventListener("focus", changed);
    document.addEventListener("visibilitychange", visible);
    // iOS does not need Background Sync: retry while open and on every foreground return.
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void check(true); }, 30_000);
    return () => { mounted.current = false; window.clearTimeout(initialCheck); window.clearInterval(interval); window.removeEventListener("online", changed); window.removeEventListener("offline", changed); window.removeEventListener(offlineChanged, changed); window.removeEventListener("focus", changed); document.removeEventListener("visibilitychange", visible); };
  }, [check]);
  useEffect(() => {
    document.documentElement.dataset.connection = offline ? "offline" : "online";
    const navigateOffline = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (navigator.onLine && !offline)) return;
      const link = (event.target as Element)?.closest("a[href]");
      if (!link || link.hasAttribute("target") || link.hasAttribute("download") || link.hasAttribute("data-reconnect")) return;
      const url = new URL(link.getAttribute("href")!, location.href);
      if (url.origin !== location.origin || !workspaceRoute(url.pathname)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (document.querySelector("[data-cached-workspace]")) {
        history.pushState(null, "", url.pathname + url.search + url.hash);
        window.dispatchEvent(new Event(localNavigation));
        window.scrollTo({ top: 0 });
        return;
      }
      // A document navigation lets the service worker serve the cached shell without RSC.
      location.assign(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", navigateOffline, true);
    return () => document.removeEventListener("click", navigateOffline, true);
  }, [offline]);
  useEffect(() => {
    const preventOnlineOnlyActions = (event: SubmitEvent) => {
      if (navigator.onLine && !offline) return;
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.method.toLowerCase() === "get" && !form.hasAttribute("data-online-only")) {
        if (document.querySelector("[data-cached-workspace]")) {
          event.preventDefault(); event.stopImmediatePropagation();
          const params = new URLSearchParams();
          new FormData(form).forEach((value, name) => { if (typeof value === "string") params.append(name, value); });
          history.pushState(null, "", location.pathname + "?" + params);
          window.dispatchEvent(new Event(localNavigation));
        }
        return;
      }
      if (form.dataset.offlineSafe === "true") return;
      event.preventDefault(); event.stopImmediatePropagation();
      setActionError("הפעולה הזו דורשת חיבור. אפשר לשמור הוצאות וקבצים כטיוטות גם ללא חיבור.");
    };
    document.addEventListener("submit", preventOnlineOnlyActions, true);
    return () => document.removeEventListener("submit", preventOnlineOnlyActions, true);
  }, [offline]);
  useEffect(() => {
    if (pathname === "/login") {
      void clearActiveProfile().catch(() => {});
      navigator.serviceWorker?.controller?.postMessage({ type: "SIGNED_OUT" });
    }
  }, [pathname]);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((registration) => {
      const prepare = () => (navigator.serviceWorker.controller ?? registration.active)?.postMessage({ type: "PREPARE_OFFLINE" });
      prepare(); navigator.serviceWorker.addEventListener("controllerchange", prepare, { once: true });
    }).catch(() => { setStorageError("הוצאות נשמרות במכשיר, אך טעינה מחדש ללא חיבור עדיין אינה זמינה."); });
  }, []);
  if (pathname === "/login" || pathname.startsWith("/auth/")) return null;
  if (!offline && !storageError && !actionError && !syncing && !drafts.length) return null;
  const status = storageError || actionError || (syncing ? `מסנכרנים ${syncing}…` : offline ? "אין חיבור · שמירה במכשיר" : drafts.some((draft) => draft.blocked) ? `${drafts.filter((draft) => draft.blocked).length} טיוטות דורשות בדיקה` : `${drafts.length} טיוטות ממתינות לסנכרון`);
  return <aside className={`connection-status ${offline || storageError ? "is-offline" : ""}`} aria-label="מצב חיבור וסנכרון">
    <div className="connection-line" role="status" aria-live="polite">
      {syncing ? <LoaderCircle size={16} className="spin" /> : offline ? <WifiOff size={16} /> : <CloudUpload size={16} />}
      <span>{status}</span>
      {drafts.length > 0 && <button type="button" className="text-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>טיוטות ({drafts.length})</button>}
    </div>
    {expanded && <div className="sync-drafts">
      <p>הטיוטות והקבצים שמורים במכשיר זה. השאירו את האפליקציה פתוחה כדי לסנכרן.</p>
      {drafts.map((draft) => <div className="sync-draft" key={draft.operation_id}>
        <strong>{draft.fields.merchant} · <bdi>{draft.fields.amount} {draft.fields.currency}</bdi></strong>
        <small>{draft.fields.spent_on} · {draft.files.length} קבצים · {draft.blocked ? "נדרשת בדיקה" : "ממתין לסנכרון"}</small>
        {draft.error && <p className="message error">{draft.error}</p>}
        <details><summary>פרטי הטיוטה</summary><p>{draft.fields.notes}</p>{draft.files.map((file) => <p key={file.id}><button type="button" className="text-button" onClick={() => {
          const url = URL.createObjectURL(file.blob), link = document.createElement("a");
          link.href = url; link.download = file.name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
        }}>שמירת {file.name} למכשיר</button></p>)}</details>
        {draft.error_code === 400 && <DraftRepair draft={draft} disabled={!!syncing || offline} />}
        {draft.error_code === 409 && <DraftConflict draft={draft} disabled={!!syncing || offline} />}
        {[401, 403].includes(draft.error_code ?? 0) && <a href="/login" className="text-button">כניסה מחדש לסנכרון</a>}
        <div className="sync-draft-actions">
          <button type="button" className="secondary" disabled={!!syncing || offline || draft.error_code === 409} onClick={async () => { await putDraft({ ...draft, blocked: false, error: undefined, error_code: undefined }); void check(true); }}>ניסיון סנכרון נוסף</button>
          <button type="button" className="text-button" disabled={!!syncing} onClick={async () => { if (confirm("למחוק את הטיוטה והקבצים מהמכשיר?")) await removeDraft(draft.operation_id); }}>מחיקת טיוטה</button>
        </div>
      </div>)}
    </div>}
  </aside>;
}
