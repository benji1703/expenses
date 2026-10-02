"use client";

import { useEffect } from "react";
import { saveSnapshot } from "@/lib/offline-store";
import type { OfflineSnapshot as Snapshot } from "@/lib/offline-types";

export function OfflineSnapshot({ snapshot }: { snapshot: Snapshot }) {
  useEffect(() => {
    void saveSnapshot(snapshot).catch(() => {});
    // Prepare only the small editor, after first paint; OCR/PDF engines remain on demand.
    const timer = window.setTimeout(() => {
      if (navigator.onLine && "serviceWorker" in navigator && process.env.NODE_ENV === "production") {
        void navigator.serviceWorker.ready.then(() => import("./expense-fields")).then(() => {
          navigator.serviceWorker.controller?.postMessage({ type: "CACHE_ASSETS", urls: performance.getEntriesByType("resource").map((entry) => entry.name) });
        }).catch(() => {});
      }
    }, 3_000);
    return () => window.clearTimeout(timer);
  }, [snapshot]);
  return null;
}
