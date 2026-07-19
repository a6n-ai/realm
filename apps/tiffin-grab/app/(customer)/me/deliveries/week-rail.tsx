"use client";

// Mobile: a horizontal Mon-Sun tiffin-tile rail. This-week/next-week via chevrons, with a spring
// transition between weeks — "today" is anchored at weekOffset 0. Bounded to the actual fetched
// data range so paging can't go past real data.
//
// The row itself is natively horizontally scrollable (7 wide tiles don't all fit a narrow phone
// at a legible size) rather than a fixed 7-col grid — a whole-row drag-to-switch-week gesture
// would fight that native scroll on the same axis, so week switching is chevron-only.

import { useState } from "react";
import { addDays, startOfWeek } from "date-fns";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { toIsoLocal, parseIsoLocal, type CalendarCell } from "./calendar-constants";
import { TiffinTile } from "./tiffin-tile";
import { cellToTileData } from "./tile-data";

export function WeekRail({
  cellsByDate, selected, onSelect, todayIso,
}: {
  cellsByDate: Map<string, CalendarCell>;
  selected: string;
  onSelect: (iso: string) => void;
  todayIso: string;
}) {
  const reduce = useReducedMotion();
  const [weekOffset, setWeekOffset] = useState(0);

  const dates = [...cellsByDate.keys()].sort();
  const lastDataDate = dates.length ? dates[dates.length - 1] : todayIso;
  const maxOffset = Math.max(
    0,
    Math.floor((parseIsoLocal(lastDataDate).getTime() - startOfWeek(parseIsoLocal(todayIso), { weekStartsOn: 1 }).getTime()) / (7 * 86_400_000)),
  );

  const weekStart = startOfWeek(addDays(parseIsoLocal(todayIso), weekOffset * 7), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => toIsoLocal(addDays(weekStart, i)));

  function go(delta: number) {
    setWeekOffset((o) => Math.min(Math.max(o + delta, 0), maxOffset));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-1">
        <Button variant="ghost" size="icon" className="size-7" disabled={weekOffset <= 0} onClick={() => go(-1)}>
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="w-28 text-center text-xs font-medium">
          {weekOffset === 0 ? "This week" : weekOffset === 1 ? "Next week" : `In ${weekOffset} weeks`}
        </span>
        <Button variant="ghost" size="icon" className="size-7" disabled={weekOffset >= maxOffset} onClick={() => go(1)}>
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={weekOffset}
          initial={reduce ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? undefined : { opacity: 0, x: -24 }}
          transition={{ type: "spring", duration: 0.35, bounce: 0 }}
          // Fixed-width tiles that scroll horizontally rather than a 7-col grid squeezed to fit
          // the viewport — at 390px a 7-across grid gives each tile ~50px, too small for a dish
          // photo + status ring + label to read cleanly. w-20 (80px) leaves everything legible
          // and the tap target well above the 44px floor, at the cost of a scroll on narrow phones.
          className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1"
        >
          {days.map((iso) => {
            const cell = cellsByDate.get(iso);
            const data = cell ? cellToTileData(cell) : null;
            return (
              <div key={iso} className="w-20 shrink-0 snap-start">
                <TiffinTile
                  variant="week"
                  date={iso}
                  status={data?.status ?? "locked"}
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
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
