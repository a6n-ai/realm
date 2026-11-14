import type { SavedAddress } from "@foundry/address";
import type { DropOffCatalog, DropOffValue } from "@/lib/catalog/drop-off";
import { swapLabel, type SwapCategory } from "@/lib/menu/swap-rules";
import type { CalendarDayInput, PlanContext } from "@/lib/deliveries/view";
import type { CalendarDay, CustomerDelivery, Subscription, TiffinCounts } from "@/lib/deliveries/customer-deliveries.service";
import { daysBetween } from "@foundry/commons/util/dates";

type PauseLimits = { maxPauses: number | null; maxPauseDaysTotal: number | null; maxPauseStretchDays: number | null };
type PauseUsage = { count: number; daysUsed: number };
export type PausePanel = { limits: PauseLimits; usage: PauseUsage };

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
  /** Eating day → portions per category after that day's swaps; days without swaps are absent. */
  portionsByDate?: Record<string, Record<string, (string | null)[]>>;
  /** Per-category pick size, unit and cap for this meal size; with sub.categoryCounts it lets the swap sheet mirror the server rules. */
  swapCategories: Record<string, SwapCategory>;
  /** The customer's saved addresses, for the per-delivery "Change address" sheet. */
  savedAddresses: SavedAddress[];
  /** Address public id → its saved drop-off. */
  addressDropOffs?: Record<string, DropOffValue>;
  /** The drop-off questions and their options, for per-delivery changes. */
  dropOff: DropOffCatalog;
};

type RowLike = Pick<CustomerDelivery, "publicId" | "id" | "deliveryDate" | "cutoffAt" | "dropOff" | "optimoCompletionStatus"> &
  Partial<Pick<CustomerDelivery, "addressLine" | "postalCode" | "lapsedPause" | "routePushed">>;

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
      addressOverride: r?.addressLine && r.postalCode ? { addressLine: r.addressLine, postalCode: r.postalCode } : null,
      dropOff: r?.dropOff,
      optimoCompletionStatus: r?.optimoCompletionStatus,
      routePushed: r?.routePushed,
      cutoffAt: r?.cutoffAt,
      lapsedPause: r?.lapsedPause,
      rescheduled: r ? a.makeupSources.has(r.id.toString()) : false,
      movedTo: r && a.makeupSources instanceof Map ? a.makeupSources.get(r.id.toString()) : undefined,
      mealsByDate,
      appliedSwaps: Object.fromEntries(
        (d.eatingDays ?? []).map((e) => [e.date, e.appliedSwaps.map((s) => ({ label: swapLabel(s, label, a.swapCategories) }))]),
      ),
    };
  });
}

export function buildPlanContext(a: { counts: TiffinCounts; cutoffHour: number; timezone: string; startDate?: string; holidays?: Record<string, string>; otherPlanDays?: Record<string, string> }): PlanContext {
  return {
    cutoffHour: a.cutoffHour,
    timezone: a.timezone,
    lastDeliveryDate: a.counts.lastDeliveryDate,
    deliveryWeekdays: a.counts.deliveryWeekdays,
    servesWeekends: a.counts.servesWeekends,
    mealDays: a.counts.mealDays,
    startDate: a.startDate,
    holidays: a.holidays ?? {},
    otherPlanDays: a.otherPlanDays ?? {},
  };
}

/** Whole days from today to the last tiffin; null when nothing is scheduled. */
export function renewDays(last: string | null, today: string): number | null {
  if (!last) return null;
  return Math.max(daysBetween(today, last), 0);
}

/**
 * Groups plans into lines: a renewal joins the line whose latest plan ends before it starts;
 * plans that overlap start their own line. Each line is ordered by start date.
 */
// ponytail: dates stand in for a renewal link; once plans may overlap, store renewed_from_order_id and chain by it.
export function planLines<T extends { publicId: string }>(subs: T[], windows: Record<string, { first: string; last: string }>): T[][] {
  const lines: T[][] = [];
  const sorted = [...subs].sort((a, b) => (windows[a.publicId]?.first ?? "").localeCompare(windows[b.publicId]?.first ?? ""));
  for (const s of sorted) {
    const first = windows[s.publicId]?.first;
    const end = (l: T[]) => windows[l[l.length - 1]!.publicId]?.last ?? "";
    const line = first ? lines.filter((l) => end(l) < first).sort((a, b) => end(b).localeCompare(end(a)))[0] : undefined;
    if (line) line.push(s);
    else lines.push([s]);
  }
  return lines;
}
