"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useNavigationState } from "@/components/navigation-state";
export function AppLink({ href, className, children, ariaCurrent, ariaLabel }: { href: string; className?: string; children: ReactNode; ariaCurrent?: "page"; ariaLabel?: string }) {
  const router = useRouter();
  const navigation = useNavigationState();
  function prepare() { if (navigator.onLine) router.prefetch(href); }
  return <Link href={href} className={className} aria-current={ariaCurrent} aria-label={ariaLabel} prefetch={href === "/expenses" || href === "/"}
    onNavigate={() => navigation.navigate(href.split(/[?#]/)[0])}
    onMouseEnter={prepare} onFocus={prepare} onPointerDown={prepare}>{children}</Link>;
}
