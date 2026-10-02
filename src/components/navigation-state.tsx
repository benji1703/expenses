"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { OfflineProfile } from "@/lib/offline-types";

type NavigationValue = { path: string; profile?: OfflineProfile; navigate: (path: string) => void; identify: (profile: OfflineProfile) => void };
const NavigationContext = createContext<NavigationValue | null>(null);

export function NavigationState({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState<{ from: string; to: string }>();
  const [profile, setProfile] = useState<OfflineProfile>();
  const [committedPath, setCommittedPath] = useState(pathname);
  if (committedPath !== pathname) {
    setCommittedPath(pathname);
    setPending(undefined);
  }
  // A pending target overrides only the page it was clicked from. Once the route
  // commits (or back/forward reaches another page), selection follows that route.
  const path = pending?.from === pathname ? pending.to : pathname;
  useEffect(() => {
    const back = () => setPending(undefined);
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  return <NavigationContext.Provider value={{ path, profile,
    navigate: (to) => setPending({ from: pathname, to }), identify: setProfile,
  }}>{children}</NavigationContext.Provider>;
}

export function useNavigationState() {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("NavigationState is required");
  return navigation;
}
