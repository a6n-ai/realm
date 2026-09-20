"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@foundry/ui/skeleton";
import { cn } from "@foundry/ui/cn";
import { parseIsoDateUtc } from "@foundry/commons";
import { formatDateOnly, formatMenuWeekRange } from "@/lib/format/datetime";
import { DAY_LABELS, HOME_MENU_DAY_COLUMNS, type DayOfWeek, type PosterItem } from "@/lib/menu/poster";
import type { menuService } from "@/lib/services/menu.service";
import { DishModal } from "./dish-modal";

type Week = Awaited<ReturnType<typeof menuService.getPublishedWeek>>;

const OFFSET: Record<DayOfWeek, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

function dateIsoOnWeek(weekStart: string, day: DayOfWeek): string {
  const d = parseIsoDateUtc(weekStart);
  d.setUTCDate(d.getUTCDate() + OFFSET[day]);
  return d.toISOString().slice(0, 10);
}

export function HomeMenuWeek({ week, todayKey, scope = "this" }: { week: Week; todayKey?: DayOfWeek; scope?: "this" | "next" }) {
  const [selected, setSelected] = useState<PosterItem | null>(null);
  const slotLabel = useMemo(() => {
    const map = new Map((week?.slots ?? []).map((s) => [s.key, s.label]));
    return (slot: string) => map.get(slot) ?? slot;
  }, [week]);

  return (
    <section className="bg-card rounded-3xl border p-4 sm:p-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{scope === "next" ? "Next week's menu" : "This week's menu"}</h2>
          {week && <p className="text-muted-foreground text-xs">{formatMenuWeekRange(week.weekStart)} · tap a dish for details</p>}
        </div>
        <Link href="/me/menu" className="text-primary min-h-11 content-center text-sm font-medium active:scale-[0.96]">
          Full menu
        </Link>
      </div>

      {!week ? (
        <p className="text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm">
          No menu released yet. When the kitchen publishes a week, it shows up here.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {HOME_MENU_DAY_COLUMNS.map((col) => {
            const day = col.days[0]!;
            const isToday = todayKey === day;
            const items = week.items.filter((i) => i.dayOfWeek === day).sort((a, b) => a.position - b.position);
            return (
              <div
                key={day}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-3 sm:gap-4",
                  isToday ? "border-primary bg-primary/5" : "bg-background/50",
                )}
              >
                <div className="w-16 shrink-0 sm:w-24">
                  <p className={cn("text-sm font-semibold", isToday && "text-primary")}>
                    {DAY_LABELS[day]}
                    {isToday && <span className="ml-1.5 text-[10px] font-semibold uppercase">Today</span>}
                  </p>
                  <p className="text-muted-foreground text-xs">{formatDateOnly(dateIsoOnWeek(week.weekStart, day), { mode: "short" })}</p>
                </div>
                <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {items.map((item) => (
                    <li key={`${item.slot}-${item.position}`}>
                      <button
                        type="button"
                        aria-label={item.dishName}
                        title={slotLabel(item.slot)}
                        onClick={() => setSelected(item)}
                        className="bg-muted hover:bg-primary/10 min-h-9 rounded-full px-3 text-xs font-medium transition-transform active:scale-[0.96] motion-reduce:active:scale-100"
                      >
                        {item.dishName}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <DishModal
        dish={{ name: selected?.dishName ?? "", description: null, image: selected?.image ?? null, planTags: [] }}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </section>
  );
}

export function HomeMenuWeekSkeleton() {
  return (
    <div className="bg-card rounded-3xl border p-4 sm:p-6">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-1.5 mb-4 h-3 w-56" />
      <div className="flex gap-3 overflow-hidden sm:grid sm:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-44 w-40 shrink-0 rounded-2xl sm:w-auto" />
        ))}
      </div>
    </div>
  );
}
