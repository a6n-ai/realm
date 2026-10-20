"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { cn } from "@foundry/ui/cn";
import { Badge } from "@/components/reui/badge";
import { formatEpoch, formatMenuWeekRange } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";

type WeekStatus = "draft" | "ready" | "released";

type WeekMenu = {
  publicId: string;
  weekStart: string;
  status: string;
  releasedAt: number | null;
  itemCount: number;
};

const STATUS: Record<WeekStatus, { label: string; variant: "success-light" | "info-light" | "invert-light" }> = {
  released: { label: "Released", variant: "success-light" },
  ready: { label: "Ready", variant: "info-light" },
  draft: { label: "Draft", variant: "invert-light" },
};

/**
 * One week as a row: the index is for picking a week, so it shows what decides which one to open
 * (when, where it stands, how full) and leaves the dishes to the week's own page.
 */
export function MenuWeekRow({ week, highlight = null }: { week: WeekMenu; highlight?: "current" | "upcoming" | null }) {
  const tz = useTimezone();
  const status = STATUS[week.status as WeekStatus] ?? { label: week.status, variant: "invert-light" as const };
  return (
    <li className={cn("flex flex-wrap items-center gap-3 px-4 py-3", highlight && "bg-primary/5")}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/dashboard/menus/${week.publicId}`} className="font-semibold tabular-nums hover:underline">
            {formatMenuWeekRange(week.weekStart)}
          </Link>
          {highlight && <Badge variant="primary-light">{highlight === "current" ? "This week" : "Upcoming"}</Badge>}
        </div>
        <p className="text-muted-foreground text-xs tabular-nums">
          {week.itemCount} {week.itemCount === 1 ? "dish" : "dishes"}
          {week.releasedAt ? ` · Released ${formatEpoch(week.releasedAt, { mode: "date", timeZone: tz })}` : ""}
        </p>
      </div>
      <Badge variant={status.variant}>{status.label}</Badge>
      <Button asChild size="sm" variant="outline">
        <Link href={`/dashboard/menus/${week.publicId}`} aria-label={`Open ${formatMenuWeekRange(week.weekStart)}`}>
          Open<ChevronRight data-icon="inline-end" />
        </Link>
      </Button>
    </li>
  );
}

export function MenuWeekRowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="divide-y rounded-xl border">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-8 w-20" />
        </li>
      ))}
    </ul>
  );
}
