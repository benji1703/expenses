"use client";

import { BookOpen, Fingerprint, LayoutDashboard, ReceiptText, Tags, Users } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { useNavigationState } from "@/components/navigation-state";
import { selectedNavigation, workspaceRoutes } from "@/lib/workspace-navigation";
import type { OfflineRole } from "@/lib/offline-types";

const icons = { overview: LayoutDashboard, expenses: ReceiptText, categories: Tags, guide: BookOpen, household: Users, account: Fingerprint };

export function WorkspaceNavigation({ role, path }: { role?: OfflineRole; path?: string }) {
  const navigation = useNavigationState();
  return <nav aria-label="ניווט ראשי">
    {workspaceRoutes.filter((route) => route.href !== "/household" || (role ?? navigation.profile?.role) === "admin").map((route) => {
      const Icon = icons[route.icon];
      const active = selectedNavigation(path ?? navigation.path, route.href);
      return <AppLink key={route.href} href={route.href} className={`nav-link${active ? " active" : ""}`} ariaCurrent={active ? "page" : undefined}><Icon size={18} />{route.label}</AppLink>;
    })}
  </nav>;
}
