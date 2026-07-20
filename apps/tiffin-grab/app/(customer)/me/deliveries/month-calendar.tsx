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

  const [month, setMonth] = useState(() => {
    const [y, m] = monthKey.split("-").map(Number);
    return new Date(y, m - 1, 1);
  });

  useEffect(() => {
    const [y, m] = monthKey.split("-").map(Number);
    setMonth(new Date(y, m - 1, 1));
  }, [monthKey]);

  function handleMonthChange(next: Date) {
    const nextStart = startOfMonth(next);
    setMonth(nextStart);
    const nextKey = monthKeyFromDate(nextStart);
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
      className="mx-auto w-full max-w-none bg-transparent p-0 [--cell-size:2.85rem] sm:max-w-md sm:[--cell-size:3rem]"
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
              diet={data.diet}
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
