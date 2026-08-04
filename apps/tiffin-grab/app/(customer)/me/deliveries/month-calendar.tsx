"use client";

// Month calendar: deliveries for the whole visible month; menu options attach per released week.

import { useEffect, useState } from "react";
import { Calendar } from "@realm/ui/calendar";
import { cn } from "@realm/ui/cn";
import { parseIsoLocal, toIsoLocal, type CalendarCell } from "./calendar-constants";
import { TiffinTile } from "./tiffin-tile";
import { cellToTileData } from "./tile-data";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function monthKeyFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function MonthCalendar({
  cellsByDate,
  selected,
  onSelect,
  todayIso,
  monthKey,
  onMonthChange,
}: {
  cellsByDate: Map<string, CalendarCell>;
  selected: string;
  onSelect: (iso: string) => void;
  todayIso: string;
  /** `YYYY-MM` of the server-loaded month. */
  monthKey: string;
  onMonthChange: (month: string) => void;
}) {
  const todayDate = new Date(`${todayIso}T00:00:00`);
  const minMonth = startOfMonth(todayDate);
  const startMonth = minMonth;
  const endMonth = addMonths(startMonth, 18);

  // The month shown follows `monthKey`. Paging is remembered only until the prop
  // catches up, so there is no effect syncing prop into state.
  const [paged, setPaged] = useState<{ fromKey: string; toKey: string; date: Date } | null>(null);
  // Valid while the parent still reports the key we paged away from (the round trip
  // has not landed yet) and once it reports the one we asked for. Anything else means
  // the parent navigated on its own, so fall back to the prop.
  const month =
    paged && (monthKey === paged.fromKey || monthKey === paged.toKey)
      ? paged.date
      : (() => {
          const [y, m] = monthKey.split("-").map(Number);
          return new Date(y, m - 1, 1);
        })();

  function handleMonthChange(next: Date) {
    const nextStart = startOfMonth(next);
    const nextKey = monthKeyFromDate(nextStart);
    setPaged({ fromKey: monthKey, toKey: nextKey, date: nextStart });
    if (nextKey !== monthKey) onMonthChange(nextKey);
  }

  return (
    <Calendar
      mode="single"
      today={todayDate}
      month={month}
      onMonthChange={handleMonthChange}
      selected={new Date(`${selected}T00:00:00`)}
      onSelect={(d) => d && onSelect(toIsoLocal(d))}
      startMonth={startMonth}
      endMonth={endMonth}
      className="mx-auto w-full max-w-md bg-transparent p-0 [--cell-size:2.85rem] sm:[--cell-size:3rem] md:mx-0 md:max-w-none md:[--cell-size:3.25rem]"
      classNames={{
        month_caption: "mb-2 flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
        today: "bg-transparent rounded-(--cell-radius)",
        weekday: "flex-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground",
        caption_label: "text-base font-semibold",
        week: "mt-1.5 flex w-full",
      }}
      components={{
        DayButton: ({ day }) => {
          const iso = toIsoLocal(day.date);
          const cell = cellsByDate.get(iso);
          const isSelected = iso === selected;
          const isToday = iso === todayIso;
          if (!cell) {
            return (
              <button
                type="button"
                onClick={() => onSelect(iso)}
                aria-label={`${day.date.getDate()}${isToday ? ", today" : ""}, not scheduled`}
                aria-pressed={isSelected}
                className={cn(
                  "flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-(--cell-radius) py-1 text-sm tabular-nums transition-colors",
                  isSelected && "bg-primary text-primary-foreground",
                  !isSelected && isToday && "bg-muted text-foreground",
                  !isSelected && !isToday && "text-muted-foreground/35",
                )}
              >
                <span>{day.date.getDate()}</span>
                <span className="h-[3px] w-5" aria-hidden />
              </button>
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
              extraCount={data.extraCount}
              isToday={isToday}
              selected={isSelected}
              onClick={() => onSelect(iso)}
            />
          );
        },
      }}
    />
  );
}
