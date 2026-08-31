"use client";

import { useMemo, useState } from "react";
import { Skeleton } from "@foundry/ui/skeleton";
import { cn } from "@foundry/ui/cn";
import { SectionCard } from "@/components/ds";
import { Reveal, Pressable, LottieEmptyState } from "@/components/motion";
import { formatMenuWeekRange } from "@/lib/format/datetime";
import { HOME_MENU_DAY_COLUMNS, type DayOfWeek, type PosterItem } from "@/lib/menu/poster";
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

export function ThisWeekMenuSection({ week, todayKey }: { week: Week; todayKey?: DayOfWeek }) {
  const [selected, setSelected] = useState<PosterItem | null>(null);

  const daysOnMenu = useMemo(() => buildDaysOnMenuMap(week?.items ?? []), [week]);

  if (!week) {
    return (
      <SectionCard title="This week's menu" subtitle="Published dishes for the current week.">
        <LottieEmptyState
          animation="empty-box"
          title="This week's menu drops soon"
          body="Check back — fresh meals are on the way."
        />
      </SectionCard>
    );
  }

  const columns = HOME_MENU_DAY_COLUMNS.map((col) => ({
    label: col.label,
    isToday: todayKey != null && col.days.includes(todayKey),
    items: week.items
      .filter((i) => col.days.includes(i.dayOfWeek))
      .sort((a, b) => a.position - b.position),
  }));

  return (
    <SectionCard title="This week's menu" subtitle={`Week of ${formatMenuWeekRange(week.weekStart)}`}>
      <Reveal.Group className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:grid md:grid-cols-7 md:gap-3 md:overflow-visible md:pb-0">
        {columns.map((col) => (
          <Reveal
            key={col.label}
            className={cn(
              "flex w-[6.75rem] shrink-0 flex-col gap-1.5 rounded-lg p-1.5 sm:w-28 md:w-auto md:min-w-0 md:shrink",
              col.isToday && "bg-primary/[0.06]",
            )}
          >
            <p
              className={cn(
                "border-b pb-1 text-[11px] font-bold tracking-wide uppercase",
                col.isToday ? "text-primary border-primary/40" : "text-primary/80 border-primary/15",
              )}
            >
              {col.label}
            </p>
            {col.items.map((item) => (
              <Pressable
                key={`${item.dayOfWeek}-${item.slot}-${item.position}`}
                type="button"
                aria-label={item.dishName}
                title={item.dishName}
                onClick={() => setSelected(item)}
                className="flex flex-col gap-1 rounded-md text-left transition-transform active:scale-[0.96]"
              >
                <div className="border-border relative aspect-[4/3] w-full overflow-hidden rounded-md border">
                  <DishImage image={item.image ?? null} name={item.dishName} category={item.slot} sizes="112px" />
                </div>
                <span className="block truncate text-[11px] font-medium leading-tight">{item.dishName}</span>
              </Pressable>
            ))}
          </Reveal>
        ))}
      </Reveal.Group>

      <DishModal
        dish={{
          name: selected?.dishName ?? "",
          description: null,
          image: selected?.image ?? null,
          // The weekly poster carries menu items, not dishes, so no tags here.
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

// Named skeleton twin — a Server Component cannot dot into this "use client"
// module's export (the /dashboard/orders bug).
export function ThisWeekMenuSectionSkeleton() {
  return (
    <SectionCard title="This week's menu" subtitle="Published dishes for the current week.">
      <div className="flex gap-3 overflow-x-auto pb-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex w-[6.75rem] shrink-0 flex-col gap-1.5">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="aspect-[4/3] w-full rounded-md" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
