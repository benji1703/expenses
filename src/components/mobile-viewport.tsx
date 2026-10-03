"use client";

import { useEffect } from "react";
import { MobileViewportController } from "@/lib/mobile-viewport";

export function MobileViewport() {
  useEffect(() => {
    const controller = new MobileViewportController(window, document);
    controller.start();
    return () => controller.dispose();
  }, []);
  return null;
}
