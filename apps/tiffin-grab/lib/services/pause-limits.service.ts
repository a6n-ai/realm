import { differenceInCalendarDays, parseISO } from "date-fns";
import { eq } from "drizzle-orm";
import { ValidationError } from "@realm/commons";
import { db } from "@/db/client";
import { app, durationPackages, orders, subscriptionPauses } from "@/db/schema";

export function spanDays(from: string, until: string): number {
  return differenceInCalendarDays(parseISO(until), parseISO(from)) + 1;
}

export async function getPauseLimits(orderId: bigint) {
  const [order] = await db.select({ weeks: orders.durationWeeks }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new ValidationError("Order not found");
  const [pkg] = await db.select({
    maxPauses: durationPackages.maxPauses,
    maxPauseDaysTotal: durationPackages.maxPauseDaysTotal,
    maxPauseStretchDays: durationPackages.maxPauseStretchDays,
  }).from(durationPackages).where(eq(durationPackages.weeks, order.weeks)).limit(1);
  const [defs] = await db.select({
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

export async function getPauseUsage(orderId: bigint) {
  const rows = await db.select({ fromDate: subscriptionPauses.fromDate, untilDate: subscriptionPauses.untilDate, resumedAt: subscriptionPauses.resumedAt })
    .from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
  const daysUsed = rows.reduce((sum, r) => sum + spanDays(r.fromDate, r.untilDate), 0);
  return { count: rows.length, daysUsed, hasOpenPause: rows.some((r) => r.resumedAt == null) };
}

export async function assertPauseAllowed(orderId: bigint, from: string, until: string, isIndefinite: boolean): Promise<void> {
  const [limits, usage] = await Promise.all([getPauseLimits(orderId), getPauseUsage(orderId)]);
  if (usage.hasOpenPause) throw new ValidationError("already paused — resume first");
  if (limits.maxPauses != null && usage.count >= limits.maxPauses) throw new ValidationError("pause limit reached");
  const span = spanDays(from, until);
  if (limits.maxPauseStretchDays != null) {
    if (isIndefinite) throw new ValidationError("indefinite pause not allowed on this plan");
    if (span > limits.maxPauseStretchDays) throw new ValidationError("pause range too long");
  }
  if (limits.maxPauseDaysTotal != null && usage.daysUsed + span > limits.maxPauseDaysTotal) {
    throw new ValidationError("pause days limit exceeded");
  }
}
