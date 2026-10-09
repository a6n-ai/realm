"use client";

import { useMemo } from "react";
import type { FacetDef } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";

/** Revenue-only extras on top of the shared analytics filter bar. */
export function RevenueFilters({ methods }: { methods: { value: string; label: string }[] }) {
  const spec = useMemo<FacetDef[]>(
    () => [
      {
        kind: "multi",
        field: "method",
        label: "Payment method",
        options: methods.map((m) => ({ value: m.value, label: m.label })),
      },
    ],
    [methods],
  );

  return <ReuiFacetFilters spec={spec} />;
}
