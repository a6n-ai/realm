"use client";

// Desktop: month calendar (reui @realm/ui/calendar) whose DayButton slot is replaced entirely
// by TiffinTile — "each day IS its meal", not an abstract numbered cell. Bounded to the actual
// fetched data range (startMonth/endMonth) so month-nav can't page into empty, undated months.

import { Calendar } from "@realm/ui/calendar";
import { toIsoLocal, type CalendarCell } from "./calendar-constants";
import { TiffinTile } from "./tiffin-tile";
import { cellToTileData } from "./tile-data";

export function MonthCalendar({
  cellsByDate, selected, onSelect, todayIso,
}: {
  cellsByDate: Map<string, CalendarCell>;
  selected: string;
  onSelect: (iso: string) => void;
  todayIso: string;
}) {
  const dates = [...cellsByDate.keys()].sort();
  const startMonth = dates.length ? new Date(`${dates[0]}T00:00:00`) : new Date(`${todayIso}T00:00:00`);
  const endMonth = dates.length ? new Date(`${dates[dates.length - 1]}T00:00:00`) : new Date(`${todayIso}T00:00:00`);

  return (
    <Calendar
      mode="single"
      selected={new Date(`${selected}T00:00:00`)}
      onSelect={(d) => d && onSelect(toIsoLocal(d))}
      startMonth={startMonth}
      endMonth={endMonth}
      defaultMonth={new Date(`${selected}T00:00:00`)}
      // Bumped from the reui default (~1.75rem) so a tile's dish photo, status ring, diet/lock
      // icon, and date+name label all read clearly — the calendar's whole point is that a day
      // cell IS its meal, not a cramped numbered box. Comfortably >=44px tap target either way.
      // Scales up at wider breakpoints rather than jumping straight to the largest size, so the
      // 7-wide grid (7 * cell-size) doesn't outgrow the [auto_1fr] panel split on medium widths.
      className="mx-auto [--cell-size:5.5rem] lg:[--cell-size:6.5rem] xl:[--cell-size:7.25rem]"
      components={{
        DayButton: ({ day }) => {
          const iso = toIsoLocal(day.date);
          const cell = cellsByDate.get(iso);
          if (!cell) {
            return <div className="flex aspect-square w-full items-center justify-center text-sm text-muted-foreground/40 tabular-nums">{day.date.getDate()}</div>;
          }
          const data = cellToTileData(cell);
          return (
            <TiffinTile
              variant="month"
              date={iso}
              status={data.status}
              dishName={data.dishName}
              dishImage={data.dishImage}
              diet={data.diet}
              extraCount={data.extraCount}
              isToday={iso === todayIso}
              selected={iso === selected}
              onClick={() => onSelect(iso)}
            />
          );
        },
      }}
    />
  );
}
