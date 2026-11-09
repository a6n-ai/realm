"use client";

import type { ComponentProps } from "react";
import { ListSearchFilters as DsListSearchFilters, ReuiFacetFilters as DsReuiFacetFilters } from "@foundry/design-system";
import { useTimezone } from "@/components/providers/timezone-provider";
import { filterRecommendationsAction, recordFilterUseAction } from "@/lib/services/filter-usage.actions";
import { DefaultDateRange } from "./default-date-range";
import { RangeCalendarPicker } from "./range-calendar-picker";

type Bound = "timeZone" | "DateField" | "oneChipPerField";

export function ReuiFacetFilters(props: Omit<ComponentProps<typeof DsReuiFacetFilters>, Bound>) {
  return <DsReuiFacetFilters {...props} timeZone={useTimezone()} DateField={RangeCalendarPicker} oneChipPerField />;
}

const recommendations = { load: filterRecommendationsAction, record: recordFilterUseAction };

export function ListSearchFilters(props: Omit<ComponentProps<typeof DsListSearchFilters>, Bound | "recommendations" | "dateSlot">) {
  return (
    <DsListSearchFilters
      pinned={3}
      debounceMs={500}
      {...props}
      timeZone={useTimezone()}
      DateField={RangeCalendarPicker}
      oneChipPerField
      dateSlot={props.dateControl === "inline" ? <DefaultDateRange /> : undefined}
      recommendations={recommendations}
    />
  );
}
