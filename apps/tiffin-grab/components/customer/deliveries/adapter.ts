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
};

type RowLike = Pick<CustomerDelivery, "publicId" | "id" | "deliveryDate" | "cutoffAt" | "pooledAt">;

export function toCalendarInputs(a: {
  days: CalendarDay[];
  rows: RowLike[];
  makeupSources: Set<string>;
  categoryLabels: Record<string, string>;
}): CalendarDayInput[] {
  const byDate = new Map(a.rows.map((r) => [r.deliveryDate, r]));
  const mealsByDate = Object.fromEntries(a.days.map((d) => [d.date, d.meal]));
  const label = (k: string) => a.categoryLabels[k] ?? k;
  return a.days.map((d) => {
    const r = byDate.get(d.date);
    return {
      ...d,
      deliveryId: r?.publicId,
      cutoffAt: r?.cutoffAt,
      pooled: r?.pooledAt != null,
      rescheduled: r ? a.makeupSources.has(r.id.toString()) : false,
      mealsByDate,
      appliedSwaps: Object.fromEntries(
        (d.eatingDays ?? []).map((e) => [e.date, e.appliedSwaps.map((s) => ({ label: `${s.qtyFrom} ${label(s.fromCategory)} → ${s.qtyTo} ${label(s.toCategory)}` }))]),
      ),
    };
  });
}

export function buildPlanContext(a: { sub: Subscription; counts: TiffinCounts; cutoffHour: number; timezone: string; pause: PausePanel }): PlanContext {
  const max = a.pause.limits.maxPauses;
  return {
    cutoffHour: a.cutoffHour,
    timezone: a.timezone,
    pooled: a.counts.pooled,
    lastDeliveryDate: a.counts.lastDeliveryDate,
    deliveryWeekdays: a.counts.deliveryWeekdays,
    active: true,
    onVacation: a.sub.status === "paused",
    vacationsLeft: max == null ? null : Math.max(max - a.pause.usage.count, 0),
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
