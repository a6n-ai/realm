"use client";

// Mobile: a horizontally scrollable day strip (Akshayakalpa-style) spanning the fetched calendar
// range — weekday + circled date + status underline per day, no dish photos. Today/selected are
// scrolled into view on mount and when selection changes. Week paging chevrons were dropped: a
// scrollable surface and left/right week buttons fight the same axis.

import { useEffect, useRef } from "react";
import { addDays, differenceInCalendarDays } from "date-fns";
import { toIsoLocal, parseIsoLocal, type CalendarCell } from "./calendar-constants";
import { TiffinTile } from "./tiffin-tile";
import { cellToTileData } from "./tile-data";

function buildScrollDays(cellsByDate: Map<string, CalendarCell>, todayIso: string): string[] {
  const dates = [...cellsByDate.keys()].sort();
  if (!dates.length) return [todayIso];

  const start = parseIsoLocal(dates[0]!);
  const end = parseIsoLocal(dates[dates.length - 1]!);
  const count = differenceInCalendarDays(end, start) + 1;
  return Array.from({ length: count }, (_, i) => toIsoLocal(addDays(start, i)));
}

export function WeekRail({
  cellsByDate, selected, onSelect, todayIso,
}: {
  cellsByDate: Map<string, CalendarCell>;
  selected: string;
  onSelect: (iso: string) => void;
  todayIso: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const days = buildScrollDays(cellsByDate, todayIso);
  const scrollTarget = selected || todayIso;

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const tile = scroller.querySelector<HTMLElement>(`[data-date="${scrollTarget}"]`);
    if (typeof tile?.scrollIntoView === "function") {
      tile.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [scrollTarget, days.length]);

  return (
    <div
      ref={scrollerRef}
      className="-mx-4 flex snap-x snap-mandatory gap-1 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {days.map((iso) => {
        const cell = cellsByDate.get(iso);
        const data = cell ? cellToTileData(cell) : null;
        return (
          <div key={iso} data-date={iso}>
            <TiffinTile
              variant="week"
              date={iso}
              status={data?.status ?? "off"}
              dishName={data?.dishName ?? null}
              dishImage={data?.dishImage ?? null}
              diet={data?.diet ?? null}
              extraCount={data?.extraCount ?? 0}
              isToday={iso === todayIso}
              selected={iso === selected}
              onClick={() => onSelect(iso)}
            />
          </div>
        );
      })}
    </div>
  );
}
