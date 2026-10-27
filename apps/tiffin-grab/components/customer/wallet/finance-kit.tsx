"use client";

import type { ReactNode } from "react";
import { ListPagination } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { FacetDef } from "@/components/ds";

export function monthKey(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(ms);
}

export function monthLabel(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "long" }).format(ms);
}

/** Consecutive items sharing a month (lists arrive newest first, so months stay contiguous). */
export function groupByMonth<T>(items: T[], at: (item: T) => number, timeZone: string) {
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const key = monthKey(at(item), timeZone);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: monthLabel(at(item), timeZone), items: [item] });
  }
  return groups;
}

/** Small uppercase header above a ListGroup, with an optional right-aligned note. */
export function GroupHeader({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pb-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{children}</h2>
      {note && <span className="text-[13px] tabular-nums text-[var(--muted-foreground)]">{note}</span>}
    </div>
  );
}

/** The shared facet filter, restyled as a kit capsule (the ReUI trigger is an outlined button). */
export function FilterBar({ spec }: { spec: FacetDef[] }) {
  return (
    <div className="[&_[data-variant=outline]]:rounded-full [&_[data-variant=outline]]:border-transparent! [&_[data-variant=outline]]:bg-[color-mix(in_oklch,var(--foreground)_8%,transparent)]! [&_[data-variant=outline]]:text-[var(--foreground)] [&_[data-variant=outline]]:shadow-none [&_[data-variant=outline]:hover]:bg-[color-mix(in_oklch,var(--foreground)_13%,transparent)]!">
      <ReuiFacetFilters spec={spec} />
    </div>
  );
}

/** Same behaviour as ListPagination, quieter: muted text, filled capsule controls, gone when one page of the smallest size holds everything. */
export function QuietPagination({ page, size, total }: { page: number; size: number; total: number }) {
  if (total <= 10) return null;
  return (
    <div className="px-1 text-[13px] [&_*]:text-[13px] [&_button]:rounded-full [&_[data-variant=outline]]:border-transparent! [&_[data-variant=outline]]:bg-[color-mix(in_oklch,var(--foreground)_8%,transparent)]! [&_[data-variant=outline]]:shadow-none [&_button:disabled]:opacity-40">
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}
