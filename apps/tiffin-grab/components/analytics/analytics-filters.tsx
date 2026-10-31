"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FilterXIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { useListNav } from "@/components/ds";
import type { FacetDef } from "@/components/ds";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { franchiseFacets } from "./franchise-facet";
import type { AnalyticsFilterOptions } from "@/lib/services/analytics/shared-filter-params";

const KEEP = new Set(["from", "to", "month", "view"]);

/**
 * Shared filter bar for every analytics subsection: date presets + range, then the facet menu with its
 * active-filter chips and Clear all. Franchise shows with 2+ visible; Revenue / Complaints append
 * tab-only facets, and Sub-category only exists once a Category is picked.
 */
export function AnalyticsFilters({
  options,
  revenueFacets = [],
  complaintFacets = [],
}: {
  options: AnalyticsFilterOptions;
  revenueFacets?: FacetDef[];
  complaintFacets?: FacetDef[];
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const nav = useListNav();
  const onComplaints = pathname.startsWith("/dashboard/analytics/complaints");
  const hasCategory = Boolean(params.get("category"));
  const staleSub = onComplaints && !hasCategory && params.has("subcategory");

  useEffect(() => {
    if (!staleSub) return;
    const sp = new URLSearchParams(params.toString());
    sp.delete("subcategory");
    nav(`${pathname}?${sp.toString()}`, "replace");
  }, [staleSub, params, pathname, nav]);

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
      ...franchiseFacets(options.orgs),
    ];
    const extras = pathname.startsWith("/dashboard/analytics/revenue")
      ? revenueFacets
      : onComplaints
        ? complaintFacets.filter((f) => hasCategory || !("field" in f) || f.field !== "subcategory")
        : [];
    return [...shared, ...extras];
  }, [options, pathname, onComplaints, hasCategory, revenueFacets, complaintFacets]);

  const hasFacets = [...params.keys()].some((k) => !KEEP.has(k));
  const clearAll = () => {
    const next = new URLSearchParams();
    for (const [k, v] of params) if (KEEP.has(k)) next.set(k, v);
    nav(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SectionDateRange presets />
      <ReuiFacetFilters spec={spec} />
      {hasFacets && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <FilterXIcon aria-hidden />
          Clear all
        </Button>
      )}
    </div>
  );
}
