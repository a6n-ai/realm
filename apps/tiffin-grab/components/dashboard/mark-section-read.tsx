"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markReadAction } from "@/lib/services/section-seen.actions";
import type { Section } from "@/lib/services/section-seen.service";

// Mark this section seen on mount, then refresh so the sidebar dot clears
// immediately on this visit (opening a section IS how you clear its dot). The
// ref guards against a double-fire if the soft refresh remounts this node.
export function MarkSectionRead({ section }: { section: Section }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void markReadAction(section).then(() => router.refresh());
  }, [section, router]);
  return null;
}
