"use client";

import { useEffect } from "react";
import { markReadAction } from "@/lib/services/section-seen.actions";
import type { Section } from "@/lib/services/section-seen.service";

// Fire-and-forget: mark this section seen once on mount. The dot clears on the
// next layout render (navigation or the global "Mark all read"). No refresh here
// on purpose — refreshing the layout on every list visit is wasteful.
export function MarkSectionRead({ section }: { section: Section }) {
  useEffect(() => {
    void markReadAction(section);
  }, [section]);
  return null;
}
