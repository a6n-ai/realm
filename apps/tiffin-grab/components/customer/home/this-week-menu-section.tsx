"use client";

import { useMemo, useState } from "react";
import { Skeleton } from "@realm/ui/skeleton";
import { cn } from "@realm/ui/cn";
import { SectionCard } from "@/components/ds";
import { Reveal, Pressable, LottieEmptyState } from "@/components/motion";
import { DAY_COLUMNS, dietDotClass, type PosterItem } from "@/lib/menu/poster";
import type { menuService } from "@/lib/services/menu.service";
import { DishImage } from "./dish-image";
import { DishModal } from "./dish-modal";

type Week = Awaited<ReturnType<typeof menuService.getPublishedWeek>>;

function buildDaysOnMenuMap(items: PosterItem[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const col of DAY_COLUMNS) {
    for (const item of items) {
      if (!item.dishPublicId || !col.days.includes(item.dayOfWeek)) continue;
      const days = map.get(item.dishPublicId) ?? [];
      if (!days.includes(col.label)) days.push(col.label);
      map.set(item.dishPublicId, days);
    }
  }
  return map;
}

export function ThisWeekMenuSection({ week }: { week: Week }) {
  const [selected, setSelected] = useState<PosterItem | null>(null);

  const daysOnMenu = useMemo(() => buildDaysOnMenuMap(week?.items ?? []), [week]);

  if (!week) {
    return (
      <SectionCard title="This week's menu">
        <LottieEmptyState
          animation="empty-box"
          title="This week's menu drops soon"
          body="Check back — fresh meals are on the way."
        />
      </SectionCard>
    );
  }

  const columns = DAY_COLUMNS.map((col) => ({
    label: col.label,
    items: week.items
      .filter((i) => col.days.includes(i.dayOfWeek))
      .sort((a, b) => a.position - b.position),
  })).filter((col) => col.items.length > 0);

  return (
    <SectionCard title="This week's menu">
      <Reveal.Group className="flex gap-4 overflow-x-auto pb-2">
        {columns.map((col) => (
          <Reveal key={col.label} className="flex w-40 shrink-0 flex-col gap-2">
            <p className="text-muted-foreground text-xs font-medium">{col.label}</p>
            {col.items.map((item) => (
              <Pressable
                key={`${item.dayOfWeek}-${item.slot}-${item.position}`}
                type="button"
                aria-label={item.dishName}
                title={item.dishName}
                onClick={() => setSelected(item)}
                className="flex flex-col gap-1 rounded-lg text-left"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-lg">
                  <DishImage image={item.image ?? null} name={item.dishName} />
                  <span
                    className={cn(
                      "absolute right-1.5 top-1.5 size-2.5 rounded-full ring-2 ring-white/80",
                      dietDotClass(item.diet, item.dishName),
                    )}
                  />
                </div>
                {item.image ? (
                  <span className="mt-1 block truncate text-xs font-medium">{item.dishName}</span>
                ) : null}
              </Pressable>
            ))}
          </Reveal>
        ))}
      </Reveal.Group>

      <DishModal
        dish={{
          name: selected?.dishName ?? "",
          description: null,
          diet: selected?.diet ?? "veg",
          image: selected?.image ?? null,
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
    <SectionCard title="This week's menu">
      <div className="flex gap-4 overflow-x-auto pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex w-40 shrink-0 flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
