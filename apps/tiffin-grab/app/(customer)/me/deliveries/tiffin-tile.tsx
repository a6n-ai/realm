"use client";

// Calendar day cell: date number + status underline (13895.jpg month grid). The mobile week strip
// adds a weekday label + optional "Today" tag. No dish photos on the grid — meals show in the
// inline detail panel below.

import { motion, useReducedMotion } from "motion/react";
import { LockIcon } from "lucide-react";
import type { FileDetail } from "@realm/storage/model";
import { cn } from "@realm/ui/cn";
import { calendarLegendLabel, type DayStatus } from "./day-status";
import { DayStatusMark } from "./calendar-legend";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function TiffinTile({
  date, status, dishName, dishImage: _dishImage, extraCount: _extraCount = 0,
  isToday = false, selected = false, variant = "month", onClick,
}: {
  date: string;
  status: DayStatus;
  dishName: string | null;
  dishImage: FileDetail | null;
  extraCount?: number;
  isToday?: boolean;
  selected?: boolean;
  variant?: "month" | "week";
  onClick?: () => void;
}) {
  const reduce = useReducedMotion();
  const local = new Date(`${date}T00:00:00`);
  const dayNum = local.getDate();
  const weekday = WEEKDAY_SHORT[local.getDay()];
  const locked = status === "locked";
  const off = status === "off";

  const tapAnimation = reduce
    ? undefined
    : locked
      ? { rotate: [0, -2.5, 2.5, -1, 0] }
      : { scale: 0.96 };

  const legendLabel = calendarLegendLabel(status);
  const statusName = legendLabel ?? (off ? "not scheduled" : null);

  const dateCircleClass = cn(
    "flex shrink-0 items-center justify-center rounded-full font-semibold tabular-nums transition-colors",
    variant === "week" ? "size-9 text-sm" : "size-8 text-sm",
        // Week strip: primary fill on the selected number. Month: same, so the status
        // mark below stays the legend color instead of washing the whole cell saffron.
    variant === "week" && selected && "bg-primary text-primary-foreground",
    variant === "week" && !selected && isToday && "ring-2 ring-primary ring-offset-1 ring-offset-background",
    variant === "week" && !selected && !isToday && "text-foreground",
    variant === "month" && selected && "bg-primary text-primary-foreground",
    variant === "month" && !selected && isToday && "ring-2 ring-primary ring-offset-1 ring-offset-background",
    variant === "month" && !selected && !isToday && "text-foreground",
  );

  const underlineVisible = status !== "off";

  if (variant === "week") {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={tapAnimation}
        transition={locked ? { duration: 0.32, ease: "easeOut" } : { type: "spring", duration: 0.3, bounce: 0 }}
        aria-label={`${weekday} ${dayNum}${isToday ? ", today" : ""}${statusName ? `, ${statusName}` : ""}${dishName ? `, ${dishName}` : ""}`}
        aria-pressed={selected}
        className={cn(
          "group relative flex min-h-11 w-14 shrink-0 snap-center touch-manipulation flex-col items-center gap-0.5 px-1 py-1.5 text-center transition-colors",
          off && !selected && "opacity-50",
        )}
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {weekday}
        </span>

        <span className="relative">
          <span className={dateCircleClass}>{dayNum}</span>
          {locked && (
            <LockIcon className="absolute -right-1 -top-1 size-3 text-muted-foreground" aria-hidden />
          )}
        </span>

        {isToday && (
          <span className="text-[9px] font-medium leading-none text-primary">Today</span>
        )}

        {underlineVisible ? (
          <DayStatusMark status={status} className="mt-0.5" />
        ) : (
          <DayStatusMark status="off" className="mt-0.5" />
        )}
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={off}
      whileTap={tapAnimation}
      transition={locked ? { duration: 0.32, ease: "easeOut" } : { type: "spring", duration: 0.3, bounce: 0 }}
      aria-label={`${dayNum}${isToday ? ", today" : ""}${statusName ? `, ${statusName}` : ""}${dishName ? `, ${dishName}` : ""}`}
      aria-pressed={selected}
      className={cn(
        // Selection is a ring + number fill so the status mark stays the legend color.
        "group relative mx-auto flex h-full min-h-11 w-full min-w-11 flex-col items-center justify-center gap-1 rounded-(--cell-radius) py-1 text-center transition-colors",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        !selected && isToday && "bg-muted",
        off && !selected && "cursor-default opacity-40",
      )}
    >
      <span className={dateCircleClass}>{dayNum}</span>
      {underlineVisible ? (
        <DayStatusMark status={status} />
      ) : (
        <DayStatusMark status="off" />
      )}
    </motion.button>
  );
}
