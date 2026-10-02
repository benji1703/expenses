export const workspaceRoutes = [
  { href: "/", label: "סקירה", icon: "overview" },
  { href: "/expenses", label: "הוצאות", icon: "expenses" },
  { href: "/categories", label: "קטגוריות", icon: "categories" },
  { href: "/guide", label: "מדריך", icon: "guide" },
  { href: "/household", label: "גישה", icon: "household" },
  { href: "/account", label: "החשבון שלי", icon: "account" },
] as const;

export function workspaceRoute(path: string) {
  const pathname = path.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  return workspaceRoutes.find((route) => route.href === pathname ||
    (route.href === "/categories" && /^\/categories\/[^/]+$/.test(pathname)));
}

export function selectedNavigation(current: string, destination: string) {
  return workspaceRoute(current)?.href === destination;
}
export const localNavigation = "meshek48:local-navigation";
export const workspaceRefresh = "meshek48:workspace-refresh";
