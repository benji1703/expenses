"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isDisconnected, subscribeConnection } from "@/lib/connection-state";
import { workspaceRefresh, workspaceRoute } from "@/lib/workspace-navigation";

export function WorkspaceMode({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const offline = useSyncExternalStore(subscribeConnection, isDisconnected, () => false);
  const wasOffline = useRef(false);
  const needsRefresh = useRef(false);
  useEffect(() => {
    if (wasOffline.current && !offline) needsRefresh.current = true;
    wasOffline.current = offline;
    const refresh = () => {
      if (!needsRefresh.current || offline || !workspaceRoute(path) || document.querySelector("dialog[open]")) return;
      needsRefresh.current = false;
      // The cached shell has /offline in its Next tree. Its reconnect controller
      // restores the real URL; refreshing that tree can discard the local editor.
      if (!document.querySelector("[data-cached-workspace]")) router.refresh();
    };
    const requestRefresh = () => { needsRefresh.current = true; refresh(); };
    document.addEventListener("close", refresh, true);
    window.addEventListener(workspaceRefresh, requestRefresh);
    refresh();
    return () => { document.removeEventListener("close", refresh, true); window.removeEventListener(workspaceRefresh, requestRefresh); };
  }, [offline, path, router]);
  // Keep the current page and any open, unsaved editor mounted when connection
  // drops. New document navigations use the cached shell at their original URL.
  return children;
}
