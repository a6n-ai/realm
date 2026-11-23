// Per-function entry points: the package root loads every date-fns module (~2s per isolated test file).
import { differenceInCalendarDays } from "date-fns/differenceInCalendarDays";
import { parseISO } from "date-fns/parseISO";
import { eq } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { app, durationPackages, orders, subscriptionPauses } from "@/db/schema";
import type { Reader } from "./pause-state";
import { settingsCache } from "@/lib/settings";
import { pausePkgCache } from "./pause-package-cache";

export function spanDays(from: string, until: string): number {
  return differenceInCalendarDays(parseISO(until), parseISO(from)) + 1;
}

type PausePackage = { maxPauses: number | null; maxPauseDaysTotal: number | null; maxPauseStretchDays: number | null };
type PauseDefaults = { defaultMaxPauses: number | null; defaultMaxPauseDaysTotal: number | null; defaultMaxPauseStretchDays: number | null };

function combineLimits(pkg: Partial<PausePackage> | undefined, defs: Partial<PauseDefaults> | undefined) {
  const pick = (p?: number | null, d?: number | null) => (p ?? d ?? null);
  return {
    maxPauses: pick(pkg?.maxPauses, defs?.defaultMaxPauses),
    maxPauseDaysTotal: pick(pkg?.maxPauseDaysTotal, defs?.defaultMaxPauseDaysTotal),
    maxPauseStretchDays: pick(pkg?.maxPauseStretchDays, defs?.defaultMaxPauseStretchDays),
  };
}

async function orderWeeks(orderId: bigint, exec: Reader): Promise<number> {
  const [order] = await exec.select({ weeks: orders.durationWeeks }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new ValidationError("Order not found");
  return order.weeks;
}

export async function getPauseLimits(orderId: bigint, exec: Reader = db, weeks?: number | null) {
  const durationWeeks = weeks ?? (await orderWeeks(orderId, exec));
  const [pkg] = await exec.select({
    maxPauses: durationPackages.maxPauses,
    maxPauseDaysTotal: durationPackages.maxPauseDaysTotal,
    maxPauseStretchDays: durationPackages.maxPauseStretchDays,
  }).from(durationPackages).where(eq(durationPackages.weeks, durationWeeks)).limit(1);
  const [defs] = await exec.select({
    defaultMaxPauses: app.defaultMaxPauses,
    defaultMaxPauseDaysTotal: app.defaultMaxPauseDaysTotal,
    defaultMaxPauseStretchDays: app.defaultMaxPauseStretchDays,
  }).from(app).limit(1);
  return combineLimits(pkg, defs);
}

// Display only (customer pause panel, staff order page). Enforcement reads getPauseLimits on the DB.
// The defaults live in settingsCache: saveSetting evicts it.

// { pkg } rather than the row itself: a weeks value with no package is cached too.
function pausePackageFor(weeks: number): Promise<{ pkg: PausePackage | null }> {
  return pausePkgCache.getOrSet(String(weeks), async () => {
    const [pkg] = await db.select({
      maxPauses: durationPackages.maxPauses,
      maxPauseDaysTotal: durationPackages.maxPauseDaysTotal,
      maxPauseStretchDays: durationPackages.maxPauseStretchDays,
    }).from(durationPackages).where(eq(durationPackages.weeks, weeks)).limit(1);
    return { pkg: pkg ?? null };
  });
}

function appPauseDefaults(): Promise<PauseDefaults> {
  return settingsCache.getOrSet("pauseDefaults", async () => {
    const [defs] = await db.select({
      defaultMaxPauses: app.defaultMaxPauses,
      defaultMaxPauseDaysTotal: app.defaultMaxPauseDaysTotal,
      defaultMaxPauseStretchDays: app.defaultMaxPauseStretchDays,
    }).from(app).limit(1);
    return {
      defaultMaxPauses: defs?.defaultMaxPauses ?? null,
      defaultMaxPauseDaysTotal: defs?.defaultMaxPauseDaysTotal ?? null,
      defaultMaxPauseStretchDays: defs?.defaultMaxPauseStretchDays ?? null,
    };
  });
}

export async function getPauseLimitsForDisplay(orderId: bigint, weeks?: number | null) {
  const durationWeeks = weeks ?? (await orderWeeks(orderId, db));
  const [{ pkg }, defs] = await Promise.all([pausePackageFor(durationWeeks), appPauseDefaults()]);
  return combineLimits(pkg ?? undefined, defs);
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
