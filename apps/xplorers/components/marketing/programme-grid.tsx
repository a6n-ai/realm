"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import { PROGRAMMES, type ProgrammeWhen } from "@/lib/marketing/content";
import { ProgrammeCard } from "@/components/marketing/ui";

type Tab = "all" | Exclude<ProgrammeWhen, "both">;

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All programmes" },
  { value: "wd", label: "Weekdays" },
  { value: "we", label: "Weekends" },
];

export function ProgrammeGrid() {
  const [tab, setTab] = useState<Tab>("all");
  const shown = PROGRAMMES.filter((p) => tab === "all" || p.when === "both" || p.when === tab);

  // Cards that survive the filter slide to their new cell instead of jumping;
  // the rest fade. Falls back to an instant swap where the API is missing.
  function choose(next: Tab) {
    if (next === tab) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduce || document.hidden) {
      setTab(next);
      return;
    }
    // The update still applies when a transition is skipped or aborted; only
    // the animation is lost, so the rejection is expected and safe to drop.
    const transition = document.startViewTransition(() => flushSync(() => setTab(next)));
    transition.ready.catch(() => {});
  }

  return (
    <>
      <div className="xl-tabs" role="group" aria-label="Filter programmes" style={{ marginTop: 28 }}>
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            className="xl-tab"
            aria-pressed={tab === t.value}
            onClick={() => choose(t.value)}
          >
            {tab === t.value ? <span className="xl-tab-pill" aria-hidden /> : null}
            {t.label}
          </button>
        ))}
      </div>
      <div className="xl-grid" style={{ marginTop: 28 }}>
        {shown.map((p) => (
          <ProgrammeCard key={p.key} programme={p} transitionName={`xl-prog-${p.key}`} />
        ))}
      </div>
    </>
  );
}
