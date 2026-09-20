"use client";

import { useMemo, useState } from "react";
import { Skeleton } from "@foundry/ui/skeleton";
import { cn } from "@foundry/ui/cn";
import { SectionCard } from "@/components/ds";
import { Pressable, LottieEmptyState } from "@/components/motion";
import { formatDateOnly, formatMenuWeekRange } from "@/lib/format/datetime";
import { parseIsoDateUtc } from "@foundry/commons";
import {
  DAY_LABELS,
  HOME_MENU_DAY_COLUMNS,
  type DayOfWeek,
  type PosterItem,
} from "@/lib/menu/poster";
import type { menuService } from "@/lib/services/menu.service";
import { DishImage } from "./dish-image";
import { DishModal } from "./dish-modal";

type Week = Awaited<ReturnType<typeof menuService.getPublishedWeek>>;

function buildDaysOnMenuMap(items: PosterItem[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const col of HOME_MENU_DAY_COLUMNS) {
    for (const item of items) {
      if (!item.dishPublicId || !col.days.includes(item.dayOfWeek)) continue;
      const days = map.get(item.dishPublicId) ?? [];
      if (!days.includes(col.label)) days.push(col.label);
      map.set(item.dishPublicId, days);
    }
  }
  return map;
}

function dateIsoOnWeek(weekStart: string, day: DayOfWeek): string {
  const offset = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 }[day];
  const d = parseIsoDateUtc(weekStart);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function ThisWeekMenuSection({
  week,
  todayKey,
  scope = "this",
}: {
  week: Week;
  todayKey?: DayOfWeek;
  scope?: "this" | "next";
}) {
  const [selected, setSelected] = useState<PosterItem | null>(null);
  const daysOnMenu = useMemo(() => buildDaysOnMenuMap(week?.items ?? []), [week]);
  const slotLabel = useMemo(() => {
    const map = new Map((week?.slots ?? []).map((s) => [s.key, s.label]));
    return (slot: string) => map.get(slot) ?? slot;
  }, [week]);

  const title = scope === "next" ? "Next week's menu" : "This week's menu";

  if (!week) {
    return (
      <SectionCard title="This week's menu" subtitle="Released dishes you can browse — picking happens on Deliveries.">
        <LottieEmptyState
          animation="empty-box"
          title="No menu released yet"
          body="When kitchen publishes a week, it shows up here."
        />
      </SectionCard>
    );
  }

  const columns = HOME_MENU_DAY_COLUMNS.map((col) => {
    const day = col.days[0]!;
    return {
      day,
      label: DAY_LABELS[day],
      dateLabel: formatDateOnly(dateIsoOnWeek(week.weekStart, day), { mode: "short" }),
      isToday: todayKey != null && col.days.includes(todayKey),
      items: week.items
        .filter((i) => col.days.includes(i.dayOfWeek))
        .sort((a, b) => a.position - b.position),
    };
  });

  return (
    <SectionCard title={title} subtitle={`${formatMenuWeekRange(week.weekStart)} · tap a dish for details`}>
      <div className="space-y-7">
        {columns.map((col) => (
          <div key={col.day} className="min-w-0">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3
                className={cn(
                  "text-base font-semibold tracking-tight",
                  col.isToday ? "text-primary" : "text-foreground",
                )}
              >
                {col.label}
                {col.isToday ? <span className="text-primary ml-2 text-xs font-medium">Today</span> : null}
              </h3>
              <p className="text-muted-foreground text-xs">{col.dateLabel}</p>
            </div>
            {col.items.length === 0 ? null : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {col.items.map((item) => (
                  <li key={`${item.dayOfWeek}-${item.slot}-${item.position}`}>
                    <Pressable
                      type="button"
                      aria-label={item.dishName}
                      onClick={() => setSelected(item)}
                      className="w-full rounded-2xl text-left"
                    >
                      <div className="border-border relative aspect-[4/3] w-full overflow-hidden rounded-2xl border">
                        <DishImage
                          image={item.image ?? null}
                          name={item.dishName}
                          category={item.slot}
                          sizes="(max-width: 640px) 45vw, 220px"
                        />
                      </div>
                      <p className="mt-2 text-sm font-medium leading-snug">{item.dishName}</p>
                      <p className="text-muted-foreground text-xs capitalize">{slotLabel(item.slot)}</p>
                    </Pressable>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <DishModal
        dish={{
          name: selected?.dishName ?? "",
          description: null,
          image: selected?.image ?? null,
          planTags: [],
        }}
        daysOnMenu={selected?.dishPublicId ? daysOnMenu.get(selected.dishPublicId) : undefined}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </SectionCard>
  );
}

export function ThisWeekMenuSectionSkeleton() {
  return (
    <SectionCard title="This week's menu" subtitle="Released dishes you can browse.">
      <div className="space-y-7">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Skeleton className="aspect-[4/3] rounded-2xl" />
              <Skeleton className="aspect-[4/3] rounded-2xl" />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
