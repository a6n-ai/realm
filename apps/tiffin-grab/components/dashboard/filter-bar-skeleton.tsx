"use client";

import { Filters, type Filter, type FilterFieldConfig } from "@foundry/design-system/filters/reui";

const noop = () => {};

// The real bar (ReuiFacetFilters) with nothing picked: the Add Filter button plus one
// key-only chip per pinned facet. Same component, so the frame cannot drift.
export function FilterBarSkeleton({ labels }: { labels: readonly string[] }) {
  // The extra unpinned field keeps the Add Filter button, which hides once every field has a chip.
  const fields: FilterFieldConfig<string>[] = [...labels, "Filter"].map((label, i) => ({
    key: `f${i}`,
    label,
    type: "multiselect",
    options: [],
  }));
  const filters: Filter<string>[] = labels.map((_, i) => ({
    id: `f${i}`,
    field: `f${i}`,
    operator: "is_any_of",
    values: [],
    pinned: true,
  }));
  return <Filters<string> filters={filters} fields={fields} onChange={noop} size="sm" allowMultiple={false} />;
}
