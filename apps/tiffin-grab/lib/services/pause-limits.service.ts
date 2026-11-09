// Per-function entry points: the package root loads every date-fns module (~2s per isolated test file).
import { differenceInCalendarDays } from "date-fns/differenceInCalendarDays";
import { parseISO } from "date-fns/parseISO";
import { eq } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { app, durationPackages, orders, subscriptionPauses } from "@/db/schema";
import type { Reader } from "./pause-state";

export function spanDays(from: string, until: string): number {
  return differenceInCalendarDays(parseISO(until), parseISO(from)) + 1;
}

export async function getPauseLimits(orderId: bigint, exec: Reader = db) {
  const [order] = await exec.select({ weeks: orders.durationWeeks }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new ValidationError("Order not found");
  const [pkg] = await exec.select({
    maxPauses: durationPackages.maxPauses,
    maxPauseDaysTotal: durationPackages.maxPauseDaysTotal,
    maxPauseStretchDays: durationPackages.maxPauseStretchDays,
  }).from(durationPackages).where(eq(durationPackages.weeks, order.weeks)).limit(1);
  const [defs] = await exec.select({
    maxPauses: app.defaultMaxPauses,
    maxPauseDaysTotal: app.defaultMaxPauseDaysTotal,
    maxPauseStretchDays: app.defaultMaxPauseStretchDays,
  }).from(app).limit(1);
  const pick = (p?: number | null, d?: number | null) => (p ?? d ?? null);
  return {
    maxPauses: pick(pkg?.maxPauses, defs?.maxPauses),
    maxPauseDaysTotal: pick(pkg?.maxPauseDaysTotal, defs?.maxPauseDaysTotal),
    maxPauseStretchDays: pick(pkg?.maxPauseStretchDays, defs?.maxPauseStretchDays),
  };
}

function chargedDays(row: { fromDate: string; untilDate: string; deliveryDates: string[] | null; releasedDates: string[] }): number {
  if (row.deliveryDates == null) return spanDays(row.fromDate, row.untilDate);
  // Each refund cancels one charge: a Friday trip refunded on a partial resume can sit next to
  // Friday's own tiffin, still paused and charged again.
  const refunds = new Map<string, number>();
  for (const d of row.releasedDates) refunds.set(d, (refunds.get(d) ?? 0) + 1);
  return row.deliveryDates.filter((d) => {
    const n = refunds.get(d) ?? 0;
    if (n === 0) return true;
    refunds.set(d, n - 1);
    return false;
  }).length;
}

export async function getPauseUsage(orderId: bigint, exec: Reader = db) {
  const rows = await exec.select({
    fromDate: subscriptionPauses.fromDate,
    untilDate: subscriptionPauses.untilDate,
    resumedAt: subscriptionPauses.resumedAt,
    deliveryDates: subscriptionPauses.deliveryDates,
    releasedDates: subscriptionPauses.releasedDates,
  }).from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
  const daysUsed = rows.reduce((sum, r) => sum + chargedDays(r), 0);
  return { count: rows.length, daysUsed, hasOpenPause: rows.some((r) => r.resumedAt == null) };
}

/** Day-set pause. Does not use the one-open-pause guard: those rows are closed audit logs. */
export async function assertDaysPauseAllowed(orderId: bigint, dates: string[], exec: Reader = db): Promise<void> {
  const limits = await getPauseLimits(orderId, exec);
  const usage = await getPauseUsage(orderId, exec);
  if (limits.maxPauses != null && usage.count >= limits.maxPauses) throw new ValidationError("pause limit reached");
  if (limits.maxPauseStretchDays != null && dates.length > limits.maxPauseStretchDays) {
    throw new ValidationError("pause range too long");
  }
  if (limits.maxPauseDaysTotal != null && usage.daysUsed + dates.length > limits.maxPauseDaysTotal) {
    throw new ValidationError("pause days limit exceeded");
  }
}
