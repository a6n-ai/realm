"use client";

import { ViewTransition, type ReactNode } from "react";
import { usePathname } from "next/navigation";

// Lateral tab nav (sidebar + bottom bar) uses page-fade. Hierarchical hops can
// opt in with Link/router `transitionTypes={["nav-forward"|"nav-back"]}`.
const BY_TYPE = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  default: "page-fade",
};

/**
 * Route-level page transition. Keyed by pathname so a route change is an exit +
 * enter (never an in-place update), which keeps ?section= / ?tab= still.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition key={pathname} enter={BY_TYPE} exit={BY_TYPE} default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
