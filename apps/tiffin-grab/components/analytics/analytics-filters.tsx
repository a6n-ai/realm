"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import type { FacetDef } from "@/components/ds";
import { DefaultDateRange } from "@/components/filters/default-date-range";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { AnalyticsFilterOptions } from "@/lib/services/analytics/shared-filter-params";

/**
 * Shared filter bar for every analytics subsection. Date sits outside the facet
 * menu (defaults to the current month). Plan / meal size / zone stay in Filter;
 * Revenue / Complaints append page-only facets when the route matches.
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
      <DefaultDateRange />
      <ReuiFacetFilters spec={spec} />
    </div>
  );
}
