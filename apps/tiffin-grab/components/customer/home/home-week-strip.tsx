"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@realm/ui/skeleton";
import { SectionCard } from "@/components/ds";
import { TransitionLink } from "@/components/motion";
import { WeekRail } from "@/app/(customer)/me/deliveries/week-rail";
import { SelectedDaySummary } from "@/app/(customer)/me/deliveries/selected-day-summary";
import { CALENDAR_LEGEND } from "@/app/(customer)/me/deliveries/day-status";
import type { CalendarCell } from "@/app/(customer)/me/deliveries/calendar-constants";
import type { DeliveryCardMeal } from "@/app/(customer)/me/deliveries/meal-chips";

export function HomeWeekStrip({
  cells,
  todayIso,
}: {
  cells: CalendarCell[];
  todayIso: string;
}) {
  const cellsByDate = useMemo(() => {
    const map = new Map<string, CalendarCell>();
    for (const c of cells) map.set(c.date, c);
    return map;
  }, [cells]);

  const [selected, setSelected] = useState(todayIso);
  // Keep the rail on "today" after navigation/refresh so home and deliveries stay aligned.
  useEffect(() => {
    setSelected(todayIso);
  }, [todayIso]);
  const cell = cellsByDate.get(selected);
  const delivery = cell?.meal
    ? { meal: cell.meal as DeliveryCardMeal }
    : undefined;

  return (
    <SectionCard title="This week" subtitle="Upcoming meals on your plan — tap a day for status.">
      <div className="space-y-3">
        <SelectedDaySummary dateIso={selected} cell={cell} delivery={delivery} alwaysVisible />
        <WeekRail
          cellsByDate={cellsByDate}
          selected={selected}
          onSelect={setSelected}
          todayIso={todayIso}
        />
        <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
          {CALENDAR_LEGEND.map((item) => (
            <li key={item.key} className="inline-flex items-center gap-1.5">
              <span className={`h-[3px] w-3 rounded-full ${item.dashClass}`} aria-hidden />
              {item.label}
            </li>
          ))}
        </ul>
        <TransitionLink href="/me/deliveries" className="text-primary block text-sm font-medium">
          Full calendar →
        </TransitionLink>
      </div>
    </SectionCard>
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
    <SectionCard title="This week" subtitle="Upcoming meals on your plan — tap a day for status.">
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="mt-3 h-16 w-full rounded-lg" />
      <Skeleton className="mt-3 h-4 w-48" />
    </SectionCard>
  );
}
