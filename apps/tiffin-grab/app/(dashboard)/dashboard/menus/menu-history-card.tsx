"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { parseIsoDateUtc } from "@realm/commons";
import { Button } from "@realm/ui/button";
import { Badge } from "@realm/ui/badge";
import { Skeleton } from "@realm/ui/skeleton";
import { buildPosterColumns, dietDotClass, type PosterItem } from "@/lib/menu/poster";
import type { MealSlot } from "@/lib/menu/meal-types";
import { formatDateOnly, formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";

type WeekMenu = {
  publicId: string;
  weekStart: string;
  status: string;
  releasedAt: number | null;
  itemCount: number;
  slots: MealSlot[];
  items: PosterItem[];
};

function weekRange(weekStart: string): string {
  const end = parseIsoDateUtc(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  const endIso = end.toISOString().slice(0, 10);
  return `${formatDateOnly(weekStart, { mode: "short" })} – ${formatDateOnly(endIso, { mode: "short" })}`;
}

export function MenuHistoryCard({
  week, planType, accent, highlight = null,
}: { week: WeekMenu; planType: string; accent: string; highlight?: "current" | "upcoming" | null }) {
  const tz = useTimezone();
  const columns = buildPosterColumns(week.slots, week.items);
  const [day, setDay] = useState(0);
  const col = columns[day];
  const cycle = (dir: number) => setDay((d) => (d + dir + columns.length) % columns.length);

  // Outer glow in the plan accent marks the live ("current") and next ("upcoming") weeks.
  const glowStyle = highlight ? { boxShadow: `0 0 0 2px ${accent}66, 0 0 22px ${accent}40` } : undefined;

  return (
    <div className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm" style={glowStyle}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-semibold tracking-tight" style={{ color: accent }}>
              {weekRange(week.weekStart)}
            </p>
            {highlight ? (
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: `${accent}22`, color: accent }}>
                {highlight === "current" ? "This week" : "Upcoming"}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {week.itemCount} dishes
            {week.releasedAt ? ` · released ${formatEpoch(week.releasedAt, { mode: "date", timeZone: tz })}` : ""}
          </p>
        </div>
        <Badge variant={week.status === "released" ? "default" : "secondary"} className="shrink-0 capitalize">
          {week.status}
        </Badge>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-10 transition-transform active:scale-[0.96]"
          onClick={() => cycle(-1)}
          aria-label="Previous day"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium">{col?.label}</span>
        <Button
          variant="outline"
          size="icon"
          className="size-10 transition-transform active:scale-[0.96]"
          onClick={() => cycle(1)}
          aria-label="Next day"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div key={day} className="mt-3 min-h-24 space-y-2 rounded-lg bg-muted/40 p-3 animate-in fade-in-0 duration-200">
        {col?.groups.every((g) => g.dishes.length === 0) ? (
          <p className="text-sm text-muted-foreground">No dishes set for this day.</p>
        ) : (
          col?.groups.map((g, gi) => (
            <div key={g.slotLabel ?? gi} className="space-y-1">
              {g.slotLabel ? <p className="text-xs font-medium text-muted-foreground">{g.slotLabel}</p> : null}
              {g.dishes.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                g.dishes.map((d, i) => (
                  <div key={`${d.name}-${i}`} className="flex items-center gap-2 text-sm">
                    <span aria-hidden className={`size-2 shrink-0 rounded-full ${dietDotClass(d.diet, d.name)}`} />
                    <span className="text-pretty">{d.name}</span>
                  </div>
                ))
              )}
            </div>
          ))
        )}
      </div>

      <Button asChild variant="ghost" size="sm" className="mt-3 w-fit gap-1.5 transition-transform active:scale-[0.96]">
        <Link href={`/dashboard/menus?type=${planType}&week=${week.publicId}`}>
          <Pencil className="size-3.5" />
          Edit week
        </Link>
      </Button>
    </div>
  );
}

// Exact loading twin: same card wrapper, header row, day-nav row, body block and
// edit-button footer as MenuHistoryCard, with grey blocks where content goes.
export function MenuHistoryCardSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Skeleton className="size-10 rounded-md" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="size-10 rounded-md" />
      </div>

      <div className="mt-3 min-h-24 space-y-2 rounded-lg bg-muted/40 p-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-36" />
      </div>

      <Skeleton className="mt-3 h-8 w-24" />
    </div>
  );
};
