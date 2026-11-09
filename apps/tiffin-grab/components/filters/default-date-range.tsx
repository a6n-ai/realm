"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { RangeCalendarPicker } from "@/components/filters/range-calendar-picker";
import { useListNav } from "@/components/ds";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { ToggleGroup, ToggleGroupItem } from "@foundry/ui/toggle-group";
import { activePreset, DATE_PRESETS, presetRange, type DatePresetKey } from "@/lib/analytics/date-presets";
import { currentMonthEpochRange } from "@/lib/services/analytics/shared-filter-params";

/**
 * The section date. Writes `from`/`to` epoch-ms on the URL and, when neither is
 * set, fills the current month in the business timezone so the picker and the
 * server query describe the same window.
 */
export function DefaultDateRange({ presets = false }: { presets?: boolean }) {
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
  // `dates=all` is an orders drill (every active plan). Filling this month would hide the older ones.
  const datesAll = params.get("dates") === "all";

  useEffect(() => {
    if (hasUrlRange || datesAll) return;
    const sp = new URLSearchParams(params.toString());
    sp.set("from", String(defaults.from));
    sp.set("to", String(defaults.to));
    nav(`${pathname}?${sp.toString()}`, "replace");
  }, [hasUrlRange, datesAll, defaults, params, pathname, nav]);

  const writeRange = (next: { from?: number; to?: number }) => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("dates");
    const range =
      next.from == null && next.to == null ? defaults : { from: next.from, to: next.to };
    if (range.from != null) sp.set("from", String(range.from));
    else sp.delete("from");
    if (range.to != null) sp.set("to", String(range.to));
    else sp.delete("to");
    nav(`${pathname}?${sp.toString()}`);
  };

  const shown = hasUrlRange ? { from, to } : datesAll ? {} : defaults;
  // Re-read the clock when the tab regains focus so the highlight cannot go stale past midnight.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const active = activePreset(shown, timezone, now);

  return (
    <>
      <RangeCalendarPicker label={datesAll ? "All dates" : "Date"} from={shown.from} to={shown.to} timeZone={timezone} onChange={writeRange} />
      {presets && (
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-label="Date presets"
        value={active ?? ""}
        onValueChange={(key) => {
          if (key) writeRange(presetRange(key as DatePresetKey, timezone));
        }}
      >
        {DATE_PRESETS.map((p) => (
          <ToggleGroupItem key={p.key} value={p.key}>
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      )}
    </>
  );
}
