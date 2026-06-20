"use client";

import { useState } from "react";
import {
  FilterBar, FilterPill, SearchInput, ListRow, StageBadge, EmptyState,
} from "@/components/ds";
import { ClipboardListIcon } from "lucide-react";

const STAGE_PILLS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "follow_up", label: "Follow-up" },
  { key: "converted", label: "Converted" },
  { key: "lost", label: "Lost" },
] as const;

type InquiryRow = {
  publicId: string;
  fullName: string;
  phone: string;
  source: string;
  stage: string;
  createdAt: number;
};

export function InquiriesList({
  rows,
  stageCounts,
}: {
  rows: InquiryRow[];
  stageCounts: { stage: string; n: number }[];
}) {
  const [search, setSearch] = useState("");
  const [activeStage, setActiveStage] = useState<string>("all");

  const countOf = (stage: string) =>
    stage === "all"
      ? rows.length
      : stageCounts.find((r) => r.stage === stage)?.n ?? 0;

  const filtered = rows.filter((r) => {
    const matchStage = activeStage === "all" || r.stage === activeStage;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.fullName.toLowerCase().includes(q) ||
      r.phone.includes(q) ||
      r.source.toLowerCase().includes(q);
    return matchStage && matchSearch;
  });

  return (
    <div className="space-y-4">
      <FilterBar
        search={
          <SearchInput value={search} onChange={setSearch} placeholder="Search inquiries…" />
        }
        filters={
          <>
            {STAGE_PILLS.map((p) => (
              <FilterPill
                key={p.key}
                label={p.label}
                active={activeStage === p.key}
                count={countOf(p.key)}
                onClick={() => setActiveStage(p.key)}
              />
            ))}
          </>
        }
      />
      {filtered.length === 0 ? (
        <EmptyState icon={ClipboardListIcon} message="No inquiries match your filter." />
      ) : (
        <div className="space-y-2">
          {filtered.map((inq) => (
            <ListRow
              key={inq.publicId}
              title={inq.fullName}
              meta={`${inq.phone} · ${inq.source}`}
              trailing={<StageBadge stage={inq.stage} />}
              href={`/dashboard/inquiries/${inq.publicId}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
