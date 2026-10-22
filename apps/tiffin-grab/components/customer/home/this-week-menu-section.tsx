"use client";

import { Skeleton } from "@/components/customer/kit";
import { SectionCard } from "@/components/ds";
import { WeekBoard } from "@/components/landing/week-board";
import { LottieEmptyState } from "@/components/motion";
import { dateOf, type buildWeekBoard } from "@/lib/landing/week-board";

type Board = ReturnType<typeof buildWeekBoard>;

/** The released week on the same board as public /menu/weekly: dish types down the side, days across, today lit. */
export function ThisWeekMenuSection({ weekStart, board, scope = "this" }: { weekStart: string | null; board: Board | null; scope?: "this" | "next" }) {
  const title = scope === "next" ? "Next week's menu" : "This week's menu";

  if (!weekStart || !board || (board.days.length === 0 && !board.weekend)) {
    return (
      <SectionCard title={title}>
        <LottieEmptyState animation="empty-box" title="No menu released yet" body="When the kitchen publishes a week, it shows up here." />
      </SectionCard>
    );
  }

  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="c-caption tabular-nums">{dateOf(weekStart, 0)} to {dateOf(weekStart, 6)}</p>
      </div>
      <WeekBoard days={board.days} rows={board.rows} weekend={board.weekend} />
    </section>
  );
}

export function ThisWeekMenuSectionSkeleton() {
  return (
    <section aria-label="This week's menu" className="flex flex-col gap-3">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-[480px] w-full rounded-3xl" />
    </section>
  );
}
