"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { DateRangePicker } from "@foundry/ui/date-range-picker";
import { useListNav } from "@/components/ds";
import { useTimezone } from "@/components/providers/timezone-provider";
import { currentMonthEpochRange } from "@/lib/services/analytics/shared-filter-params";

/**
 * The section date. Writes `from`/`to` epoch-ms on the URL and, when neither is
 * set, fills the current month in the business timezone so the picker and the
 * server query describe the same window.
 */
export function DefaultDateRange() {
  const nav = useListNav();
  const pathname = usePathname();
  const params = useSearchParams();
  const timezone = useTimezone();

  const defaults = useMemo(() => currentMonthEpochRange(timezone), [timezone]);

  const fromParam = params.get("from");
  const toParam = params.get("to");
  const from = fromParam != null && fromParam !== "" ? Number(fromParam) : undefined;
  const to = toParam != null && toParam !== "" ? Number(toParam) : undefined;
  const hasUrlRange =
    (from != null && Number.isFinite(from)) || (to != null && Number.isFinite(to));

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
      next.from == null && next.to == null ? defaults : { from: next.from, to: next.to };
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
      timeZone={timezone}
      onChange={writeRange}
    />
  );
}
