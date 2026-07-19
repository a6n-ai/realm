"use client";

// Month calendar (reui @realm/ui/calendar) with compact day cells: date number + status dash,
// matching the Akshayakalpa Calendar tab reference (13895.jpg). Bounded to fetched data range.

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
      // Mobile-first: fill the phone width; slightly larger cells on sm+.
      className="mx-auto w-full max-w-none bg-transparent p-0 [--cell-size:2.85rem] sm:max-w-md sm:[--cell-size:3rem]"
      classNames={{
        weekday: "flex-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground",
        month_caption: "mb-2",
        caption_label: "text-base font-semibold",
        week: "mt-1.5 flex w-full",
      }}
      components={{
        DayButton: ({ day }) => {
          const iso = toIsoLocal(day.date);
          const cell = cellsByDate.get(iso);
          if (!cell) {
            return (
              <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 py-1 text-sm text-muted-foreground/35 tabular-nums">
                <span>{day.date.getDate()}</span>
                <span className="h-[3px] w-5" aria-hidden />
              </div>
            );
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
