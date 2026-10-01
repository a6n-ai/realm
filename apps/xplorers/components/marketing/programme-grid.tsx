"use client";

import { useState } from "react";
import { PROGRAMMES, type ProgrammeWhen } from "@/lib/marketing/content";
import { ProgrammeCard } from "@/components/marketing/ui";

const TABS: { value: "all" | Exclude<ProgrammeWhen, "both">; label: string }[] = [
  { value: "all", label: "All programmes" },
  { value: "wd", label: "Weekdays" },
  { value: "we", label: "Weekends" },
];

export function ProgrammeGrid() {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("all");
  const [touched, setTouched] = useState(false);
  const shown = PROGRAMMES.filter((p) => tab === "all" || p.when === "both" || p.when === tab);

  return (
    <>
      <div className="xl-tabs" role="group" aria-label="Filter programmes" style={{ marginTop: 28 }}>
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            className="xl-tab"
            aria-pressed={tab === t.value}
            onClick={() => {
              setTab(t.value);
              setTouched(true);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* Keyed by tab so the cards replay their short fade on each filter change. */}
      <div key={tab} className="xl-grid" data-animate={touched ? "" : undefined} style={{ marginTop: 28 }}>
        {shown.map((p) => (
          <ProgrammeCard key={p.key} programme={p} />
        ))}
      </div>
    </>
  );
}
