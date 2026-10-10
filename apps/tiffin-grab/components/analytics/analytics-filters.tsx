"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { DateRangePicker } from "@foundry/ui/date-range-picker";
import type { FacetDef } from "@/components/ds";
import { useListNav } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import {
  currentMonthEpochRange,
  type AnalyticsFilterOptions,
} from "@/lib/services/analytics/shared-filter-params";

/**
 * Shared filter bar for every analytics subsection. Date sits outside the facet
 * menu (defaults to the current month). Plan / meal size / zone stay in Filter;
 * Revenue / Complaints append page-only facets when the route matches.
 */
export function AnalyticsFilters({
  options,
  timezone,
  revenueFacets = [],
  complaintFacets = [],
}: {
  options: AnalyticsFilterOptions;
  timezone: string;
  revenueFacets?: FacetDef[];
  complaintFacets?: FacetDef[];
}) {
  const pathname = usePathname();

  const spec = useMemo<FacetDef[]>(() => {
    const shared: FacetDef[] = [
      { kind: "multi", field: "plan", label: "Meal plan", options: options.plans },
      {
        kind: "multi",
        field: "mealSize",
        label: "Meal size",
        dependsOn: "plan",
        options: options.mealSizes,
      },
      { kind: "multi", field: "zone", label: "Zone", options: options.zones },
    ];
    const extras = pathname.startsWith("/dashboard/analytics/revenue")
      ? revenueFacets
      : pathname.startsWith("/dashboard/analytics/complaints")
        ? complaintFacets
        : [];
    return [...shared, ...extras];
  }, [options, pathname, revenueFacets, complaintFacets]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AnalyticsDateRange timezone={timezone} />
      <ReuiFacetFilters spec={spec} />
    </div>
  );
}

function AnalyticsDateRange({ timezone }: { timezone: string }) {
  const nav = useListNav();
  const pathname = usePathname();
  const params = useSearchParams();

  const defaults = useMemo(() => currentMonthEpochRange(timezone), [timezone]);

  const fromParam = params.get("from");
  const toParam = params.get("to");
  const from = fromParam != null && fromParam !== "" ? Number(fromParam) : undefined;
  const to = toParam != null && toParam !== "" ? Number(toParam) : undefined;
  const hasUrlRange =
    (from != null && Number.isFinite(from)) || (to != null && Number.isFinite(to));

  // Seed the URL so SSR cards and the picker share the same current-month window.
  useEffect(() => {
    if (hasUrlRange) return;
    const sp = new URLSearchParams(params.toString());
    sp.set("from", String(defaults.from));
    sp.set("to", String(defaults.to));
    nav(`${pathname}?${sp.toString()}`, "replace");
  }, [hasUrlRange, defaults, params, pathname, nav]);

  const writeRange = (next: { from?: number; to?: number }) => {
    const sp = new URLSearchParams(params.toString());
    const range =
      next.from == null && next.to == null
        ? defaults
        : { from: next.from, to: next.to };
    if (range.from != null) sp.set("from", String(range.from));
    else sp.delete("from");
    if (range.to != null) sp.set("to", String(range.to));
    else sp.delete("to");
    nav(`${pathname}?${sp.toString()}`);
  };

  return (
    <DateRangePicker
      label="Date"
      from={hasUrlRange ? from : defaults.from}
      to={hasUrlRange ? to : defaults.to}
      onChange={writeRange}
    />
  );
}
