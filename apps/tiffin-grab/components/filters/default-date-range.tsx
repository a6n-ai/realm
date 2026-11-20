"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { RangeCalendarPicker } from "@/components/filters/range-calendar-picker";
import { useListNav } from "@/components/ds";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { ButtonGroup } from "@foundry/ui/button-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { ClockIcon } from "lucide-react";
import { activePreset, DATE_PRESETS, type DatePresetKey } from "@/lib/analytics/date-presets";
import { currentMonthEpochRange } from "@/lib/dates/epoch-window";
import { parseRangeParams, rangeParams } from "@/lib/dates/range-params";

/**
 * The section date. The current month is the default and writes nothing; a preset
 * writes `range=<key>`, a custom range ISO `from`/`to` (see `rangeParams`). Legacy
 * epoch-ms links still parse.
 */
// `presets` is kept for callers; the preset half is always shown.
export function DefaultDateRange(_: { presets?: boolean }) {
  const nav = useListNav();
  const pathname = usePathname();
  const params = useSearchParams();
  const timezone = useTimezone();

  const defaults = useMemo(() => currentMonthEpochRange(timezone), [timezone]);

  const parsed = parseRangeParams(Object.fromEntries(params), timezone);
  const hasUrlRange = parsed.from != null || parsed.to != null;
  // `dates=all` is an orders drill (every active plan). Filling this month would hide the older ones.
  const datesAll = params.get("dates") === "all";

  const write = (dates: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const key of ["dates", "from", "to", "range"]) sp.delete(key);
    for (const [k, v] of Object.entries(dates)) sp.set(k, v);
    const qs = sp.toString();
    nav(qs ? `${pathname}?${qs}` : pathname);
  };
  const writeRange = (next: { from?: number; to?: number }) =>
    write(rangeParams(next.from == null && next.to == null ? defaults : next, timezone));

  const shown = hasUrlRange ? { from: parsed.from, to: parsed.to } : datesAll ? {} : defaults;
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

  const popupRadius = "rounded-(--ui-radius-popup)!";

  return (
    <ButtonGroup aria-label="Date range">
      <Select
        value={active ?? "custom"}
        onValueChange={(key) => {
          if (key !== "custom") write(rangeParams({ preset: key as DatePresetKey }, timezone));
        }}
      >
        <SelectTrigger aria-label="Date presets" className="data-[size=default]:h-9 min-w-36 text-sm">
          <ClockIcon className="text-muted-foreground size-4" aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className={`min-w-52 ${popupRadius}`}>
          {DATE_PRESETS.map((p) => (
            <SelectItem key={p.key} value={p.key}>
              {p.label}
            </SelectItem>
          ))}
          {active == null && (
            <SelectItem value="custom" disabled>
              {datesAll ? "All time" : "Custom"}
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      <RangeCalendarPicker
        label={datesAll ? "All dates" : "Date"}
        clearLabel="This month"
        from={shown.from}
        to={shown.to}
        timeZone={timezone}
        onChange={writeRange}
      />
    </ButtonGroup>
  );
}
