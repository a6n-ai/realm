"use client";

import { useEffect, useRef } from "react";
import { markReadAction } from "@/lib/services/section-seen.actions";
import type { Section } from "@/lib/services/section-seen.service";
import { SECTION_READ_EVENT } from "./app-sidebar";

// Mark this section seen on mount, then tell the sidebar to clear its dot
// locally. No router.refresh(): that re-rendered the whole dashboard layout and
// refetched every query on the page just to hide one dot, on every visit.
export function MarkSectionRead({ section }: { section: Section }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void markReadAction(section).then(() =>
      window.dispatchEvent(new CustomEvent(SECTION_READ_EVENT, { detail: section })),
    );
  }, [section]);
  return null;
}
