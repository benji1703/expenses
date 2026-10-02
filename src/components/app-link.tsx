"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
function Progress() {
  const { pending } = useLinkStatus();
  return <span className="nav-progress" data-pending={pending} aria-hidden="true" />;
}
export function AppLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  function prepare() { if (navigator.onLine) router.prefetch(href); }
  return <Link href={href} className={className} prefetch={href === "/expenses" || href === "/"}
    onMouseEnter={prepare} onFocus={prepare} onPointerDown={prepare}>{children}<Progress /></Link>;
}
