"use client";

import { Skeleton } from "@/components/customer/kit";
import { cn } from "@/components/customer/kit/cn";
import { SectionCard } from "@/components/ds";
import { LottieEmptyState } from "@/components/motion";
import { formatMenuWeekRange } from "@/lib/format/datetime";
import { buildPosterColumns, type DayOfWeek } from "@/lib/menu/poster";
import type { menuService } from "@/lib/services/menu.service";

type Week = Awaited<ReturnType<typeof menuService.getPublishedWeek>>;

export function ThisWeekMenuSection({
  week,
  todayKey,
  scope = "this",
}: {
  week: Week;
  todayKey?: DayOfWeek;
  scope?: "this" | "next";
}) {
  const title = scope === "next" ? "Next week's menu" : "This week's menu";

  if (!week) {
    return (
      <SectionCard title={title}>
        <LottieEmptyState
          animation="empty-box"
          title="No menu released yet"
          body="When kitchen publishes a week, it shows up here."
        />
      </SectionCard>
    );
  }

  // Use the poster grouping: 6 columns (Mon-Fri, Weekends)
  const columns = buildPosterColumns(week.slots, week.items);

  // Split into left and right columns for the 2-column layout
  // Left: Mon (0), Wed (2), Fri (4)
  // Right: Tue (1), Thu (3), Weekends (5)
  const leftCol = [columns[0], columns[2], columns[4]].filter(Boolean);
  const rightCol = [columns[1], columns[3], columns[5]].filter(Boolean);

  return (
    <SectionCard title={title}>
      <div className="bg-card border-border relative overflow-hidden rounded-3xl border shadow-sm ring-1 ring-black/5">
        
        {/* Poster Header */}
        <div className="bg-primary/5 border-border flex flex-col items-center justify-center border-b p-6 text-center">
          <h2 className="text-primary text-xl font-bold tracking-tight uppercase">Tiffin Menu</h2>
          <p className="text-muted-foreground mt-1 text-sm font-medium">{formatMenuWeekRange(week.weekStart)}</p>
        </div>

        <div className="grid grid-cols-1 gap-x-12 gap-y-8 p-6 sm:grid-cols-2 sm:p-10">
          {/* Left Column */}
          <div className="space-y-8">
            {leftCol.map((col) => (
              <DayBlock key={col.label} col={col} />
            ))}
          </div>
          {/* Right Column */}
          <div className="space-y-8">
            {rightCol.map((col) => (
              <DayBlock key={col.label} col={col} />
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function DayBlock({ col }: { col: any }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 flex w-full items-center gap-4">
        <div className="bg-primary/20 h-px flex-1" />
        <h3 className="text-primary text-sm font-bold tracking-widest uppercase">{col.label}</h3>
        <div className="bg-primary/20 h-px flex-1" />
      </div>
      
      {col.groups.length > 0 ? (
        <ul className="space-y-2.5">
          {col.groups.flatMap((g: any) => g.dishes).map((d: any, i: number) => (
            <li key={i}>
              <span className="text-foreground text-sm font-medium leading-relaxed">
                {d.name}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm italic">Menu coming soon</p>
      )}
    </div>
  );
}

export function ThisWeekMenuSectionSkeleton() {
  return (
    <SectionCard title="This week's menu">
       <div className="bg-card border-border h-[600px] w-full rounded-3xl border" />
    </SectionCard>
  );
}
