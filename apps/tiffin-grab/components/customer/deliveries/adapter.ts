import { labelAppliedSwaps, type SwapCategory } from "@/lib/menu/swap-rules";
import type { CalendarDayInput, PlanContext, Trip } from "@/lib/deliveries-view";
import type { CalendarDay, CustomerDelivery, Subscription, TiffinCounts } from "@/lib/services/customer-deliveries.service";

type PauseLimits = { maxPauses: number | null; maxPauseDaysTotal: number | null; maxPauseStretchDays: number | null };
type PauseUsage = { count: number; daysUsed: number };
export type PausePanel = { limits: PauseLimits; usage: PauseUsage };

/** Everything an action sheet needs beyond the trip itself. */
export type PlanView = {
  orderId: string;
  sub: Subscription;
  counts: TiffinCounts;
  ctx: PlanContext;
  pause: PausePanel;
  today: string;
  /** Raw myCalendar output for the month: per-eating-day swap pairs and applied swaps live here. */
  days: CalendarDay[];
  categoryLabels: Record<string, string>;
  categoryPortions: Record<string, string>;
  /** Per-composition-row portions (catalog order). Prefer over categoryPortions for dish lines. */
  categoryPortionSlots: Record<string, string[]>;
  /** Per-category pick size, unit and cap for this meal size; with sub.categoryCounts it lets the swap sheet mirror the server rules. */
  swapCategories: Record<string, SwapCategory>;
};

type RowLike = Pick<CustomerDelivery, "publicId" | "id" | "deliveryDate" | "cutoffAt" | "pooledAt">;

export function toCalendarInputs(a: {
  days: CalendarDay[];
  rows: RowLike[];
  makeupSources: Set<string> | Map<string, string>;
  categoryLabels: Record<string, string>;
  swapCategories?: Record<string, SwapCategory>;
}): CalendarDayInput[] {
  const byDate = new Map(a.rows.map((r) => [r.deliveryDate, r]));
  const mealsByDate: Record<string, CalendarDay["meal"]> = Object.fromEntries(a.days.map((d) => [d.date, d.meal]));
  for (const d of a.days) Object.assign(mealsByDate, d.carriedMeals);
  const label = (k: string) => a.categoryLabels[k] ?? k;
  return a.days.map((d) => {
    const r = byDate.get(d.date);
    return {
      ...d,
      deliveryId: r?.publicId,
      cutoffAt: r?.cutoffAt,
      pooled: r?.pooledAt != null,
      rescheduled: r ? a.makeupSources.has(r.id.toString()) : false,
      movedTo: r && a.makeupSources instanceof Map ? a.makeupSources.get(r.id.toString()) : undefined,
      mealsByDate,
      appliedSwaps: Object.fromEntries(
        (d.eatingDays ?? []).map((e) => {
          const labels = labelAppliedSwaps(e.appliedSwaps, label, a.swapCategories);
          return [e.date, e.appliedSwaps.map((_, i) => ({ label: labels[i]! }))];
        }),
      ),
    };
  });
}

export function buildPlanContext(a: { sub: Subscription; counts: TiffinCounts; cutoffHour: number; timezone: string; pause: PausePanel; startDate?: string }): PlanContext {
  const max = a.pause.limits.maxPauses;
  return {
    cutoffHour: a.cutoffHour,
    timezone: a.timezone,
    pooled: a.counts.pooled,
    lastDeliveryDate: a.counts.lastDeliveryDate,
    deliveryWeekdays: a.counts.deliveryWeekdays,
    eatingWeekdays: a.counts.eatingWeekdays,
    startDate: a.startDate,
    active: true,
    onVacation: a.sub.status === "paused",
    vacationsLeft: max == null ? null : Math.max(max - a.pause.usage.count, 0),
    frequencyKey: a.sub.frequencyKey ?? null,
  };
}

/** Whole days from today to the last tiffin; null when nothing is scheduled. */
export function renewDays(last: string | null, today: string): number | null {
  if (!last) return null;
  return Math.max(Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5), 0);
}

/** ?trip if it names a real trip, else the next upcoming, else the next on hold, else the first. */
export function pickDefaultTrip(trips: Trip[], requested: string | undefined): string | null {
  if (requested && trips.some((t) => t.date === requested)) return requested;
  return (trips.find((t) => t.status === "upcoming") ?? trips.find((t) => t.status === "hold") ?? trips[0])?.date ?? null;
}
