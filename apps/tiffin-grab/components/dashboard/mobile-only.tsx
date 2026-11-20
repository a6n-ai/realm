"use client";

import type { ReactNode } from "react";
import { useIsMobile } from "@foundry/ui/use-mobile";

// Unmounts below-md chrome on desktop instead of hiding it: a hidden GlobalSearch still
// registers F/⌘K and writes ?q=, so only one mounted copy may exist at a time.
export function MobileOnly({ children }: { children: ReactNode }) {
  return useIsMobile() ? children : null;
}
