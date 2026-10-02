"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isDisconnected, subscribeConnection } from "@/lib/connection-state";
import { workspaceRoute } from "@/lib/workspace-navigation";

export function WorkspaceMode({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const offline = useSyncExternalStore(subscribeConnection, isDisconnected, () => false);
  const wasOffline = useRef(false);
  useEffect(() => {
    if (wasOffline.current && !offline && workspaceRoute(path)) router.refresh();
    wasOffline.current = offline;
  }, [offline, path, router]);
  // Keep the current page and any open, unsaved editor mounted when connection
  // drops. New document navigations use the cached shell at their original URL.
  return children;
}
