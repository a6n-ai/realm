"use client";

import { ViewTransition, type ReactNode } from "react";
import { usePathname } from "next/navigation";

// Navigations tagged nav-forward / nav-back (Link or router.push `transitionTypes`) slide
// that way; every other route change (plain links, browser back) gets a short fade.
const BY_TYPE = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-fade" };

// Areas that each render under their own layout. Crossing between them swaps the whole layout
// segment, which the per-page boundary inside that layout can't animate, so the root does.
const AREAS = ["/me", "/dashboard", "/subscribe", "/checkout", "/activate"];

function area(pathname: string) {
  return AREAS.find((a) => pathname === a || pathname.startsWith(`${a}/`)) ?? "site";
}

/**
 * Route-level page transition. Keyed by pathname so a route change is an exit + enter
 * (never an in-place update), which keeps ?tab= switches, refreshes and form actions still.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition key={pathname} enter={BY_TYPE} exit={BY_TYPE} default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}

/** Root-level: animates hops between areas (subscribe → plan → checkout → activate). */
export function AreaTransition({ children }: { children: ReactNode }) {
  const key = area(usePathname());
  return (
    <ViewTransition key={key} enter={BY_TYPE} exit={BY_TYPE} default="none">
      <div className="flex min-h-full flex-1 flex-col">{children}</div>
    </ViewTransition>
  );
}
