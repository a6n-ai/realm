"use client";

import { useMemo } from "react";
import type { FacetDef } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { AnalyticsFilterOptions } from "@/lib/services/analytics/shared-filters";

/**
 * Shared filter bar for every analytics subsection. Writes `from`/`to` (epoch),
 * `plan`, `mealSize`, and `zone` into the URL so each page's cards re-render
 * with the same scope.
 */
export function AnalyticsFilters({ options }: { options: AnalyticsFilterOptions }) {
  const spec = useMemo<FacetDef[]>(
    () => [
      { kind: "dateRange", field: "createdAt", label: "Date" },
      { kind: "multi", field: "plan", label: "Meal plan", options: options.plans },
      {
        kind: "multi",
        field: "mealSize",
        label: "Meal size",
        dependsOn: "plan",
        options: options.mealSizes,
      },
      { kind: "multi", field: "zone", label: "Zone", options: options.zones },
    ],
    [options],
  );

  return <ReuiFacetFilters spec={spec} />;
}
