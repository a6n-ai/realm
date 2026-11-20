"use client";

import { FilterPill } from "@/components/ds";

const noop = () => {};

// The real pills, inert: same markup as the live row, nothing focusable. The first label is the default selection.
export function PillsRowSkeleton({ labels }: { labels: readonly string[] }) {
  return (
    <div inert className="contents">
      {labels.map((label, i) => (
        <FilterPill key={label} label={label} active={i === 0} onClick={noop} />
      ))}
    </div>
  );
}
