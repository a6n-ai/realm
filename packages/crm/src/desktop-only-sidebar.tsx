"use client";

import type { ReactNode } from "react";
import { useIsMobile } from "@realm/ui/use-mobile";

/**
 * Keeps sidebar chrome desktop-only. CSS hides on first paint; after mount on
 * mobile we unmount so the shadcn mobile Sheet never portals into the page.
 */
export function DesktopOnlySidebar({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  if (isMobile) return null;
  return <div className="max-md:hidden">{children}</div>;
}
