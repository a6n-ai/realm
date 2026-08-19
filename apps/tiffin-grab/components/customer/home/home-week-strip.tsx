"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@realm/ui/skeleton";
import { SectionCard } from "@/components/ds";
import { TransitionLink } from "@/components/motion";
import { WeekRail } from "@/app/(customer)/me/deliveries/week-rail";
import { CalendarLegend } from "@/app/(customer)/me/deliveries/calendar-legend";
import { pickCalendarSelectedDay, type CalendarCell } from "@/app/(customer)/me/deliveries/calendar-constants";
import type { DeliveryCardMeal } from "@/app/(customer)/me/deliveries/meal-chips";
import { selectedDaySummaryMessage } from "@/app/(customer)/me/deliveries/day-summary-message";
import { formatDateOnly } from "@/lib/format/datetime";

export function HomeWeekStrip({
  cells,
  todayIso,
  mealSizeName,
}: {
  cells: CalendarCell[];
  todayIso: string;
  mealSizeName?: string;
}) {
  const cellsByDate = useMemo(() => {
    const map = new Map<string, CalendarCell>();
    for (const c of cells) map.set(c.date, c);
    return map;
  }, [cells]);

  const initial = pickCalendarSelectedDay(cells.map((c) => c.date), todayIso);
  // Keep the rail on the picked day after navigation/refresh so home and deliveries stay
  // aligned. Derived rather than re-synced in an effect: a pick is remembered only
  // for the day it was made on, so a new app-day falls back to the next tiffin by itself.
  const [picked, setPicked] = useState<{ day: string; date: string } | null>(null);
  const selected = picked?.day === todayIso ? picked.date : initial;
  const setSelected = (date: string) => setPicked({ day: todayIso, date });
  const cell = cellsByDate.get(selected);
  const delivery = cell?.meal
    ? { meal: cell.meal as DeliveryCardMeal }
    : undefined;

  return (
    <SectionCard
      title="This week"
      subtitle="Tap a day to see what's arriving."
      action={
        <TransitionLink href="/me/deliveries" className="text-primary text-sm font-medium active:scale-[0.96]">
          Full calendar
        </TransitionLink>
      }
    >
      <div className="space-y-4">
        <HomeDayPanel dateIso={selected} cell={cell} delivery={delivery} mealSizeName={mealSizeName} />
        <WeekRail
          cellsByDate={cellsByDate}
          selected={selected}
          onSelect={setSelected}
          todayIso={todayIso}
        />
        <CalendarLegend />
      </div>
    </SectionCard>
  );
}

function HomeDayPanel({
  dateIso,
  cell,
  delivery,
  mealSizeName,
}: {
  dateIso: string;
  cell: CalendarCell | undefined;
  delivery: { meal: DeliveryCardMeal } | undefined;
  mealSizeName?: string;
}) {
  const message = selectedDaySummaryMessage({ dateIso, cell, delivery });
  const heading = formatDateOnly(dateIso, { mode: "weekday" });

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium tabular-nums text-muted-foreground">{heading}</p>
      <p className="text-sm font-semibold text-pretty leading-snug">{message}</p>
      {mealSizeName && cell ? (
        <p className="text-xs text-muted-foreground">{mealSizeName}</p>
      ) : null}
    </div>
  );
}

export function HomeWeekStripEmpty() {
  return (
    <SectionCard title="This week" subtitle="Upcoming meals on your plan — tap a day for status.">
      <p className="text-muted-foreground text-sm text-pretty">
        No deliveries scheduled yet. Start a plan to see your week here.
      </p>
      <Link href="/subscribe" className="text-primary mt-3 inline-block text-sm font-medium">
        Browse plans →
      </Link>
    </SectionCard>
  );
}

export function HomeWeekStripSkeleton() {
  return (
    <SectionCard title="This week" subtitle="Tap a day to see what's arriving.">
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="mt-4 h-16 w-full rounded-lg" />
      <Skeleton className="mt-3 h-4 w-48" />
    </SectionCard>
  );
}
