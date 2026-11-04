import { and, between, eq, gt, notInArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import { coupons, discounts, promotions } from "@/db/schema";
import { dateTimeFormat } from "@/lib/intl/date-format";

function zoneOffsetMs(ms: number, timezone: string): number {
  const p = Object.fromEntries(
    dateTimeFormat("en-CA", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}

function localMidnightMs(nowMs: number, timezone: string): number {
  const local = new Date(nowMs + zoneOffsetMs(nowMs, timezone));
  const wall = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // Offset at the midnight itself, not at `now`: they differ on the day the clocks change.
  const guess = wall - zoneOffsetMs(wall, timezone);
  return wall - zoneOffsetMs(guess, timezone);
}

/** Latest of the most recent local midnight and any window edge already passed. */
export function lastBoundary(nowMs: number, timezone: string, windowEdgesMs: number[]): number {
  return windowEdgesMs.reduce((m, e) => (e <= nowMs && e > m ? e : m), localMidnightMs(nowMs, timezone));
}

// Live-only service lists drop a window the moment it ends, which is exactly the edge we need, so read
// the window columns directly. Coupons follow couponsService.listAvailable: staff and hidden codes never
// show on the public site, so their windows are not boundaries. One query for both directions so the
// filters cannot drift; `inWindow` picks which edges to look at.
type Col = Parameters<typeof between>[0];
async function queryEdges(inWindow: (col: Col) => ReturnType<typeof gt>): Promise<number[]> {
  const within = (a: Col, b: Col) => or(inWindow(a), inWindow(b));
  const [p, c, d] = await Promise.all([
    db.select({ a: promotions.startsAt, b: promotions.endsAt }).from(promotions).where(within(promotions.startsAt, promotions.endsAt)),
    db
      .select({ a: coupons.startsAt, b: coupons.expiresAt })
      .from(coupons)
      .where(and(eq(coupons.active, true), eq(coupons.visible, true), notInArray(coupons.kind, ["rep_daily", "rep_code"]), within(coupons.startsAt, coupons.expiresAt))),
    db.select({ a: discounts.startsAt, b: discounts.endsAt }).from(discounts).where(within(discounts.startsAt, discounts.endsAt)),
  ]);
  return [...p, ...c, ...d].flatMap((r) => [r.a, r.b]).filter((e): e is number => e != null);
}

/** Edges since the previous local midnight: only those can beat the latest midnight, so older rows are never read. */
export function loadWindowEdges(nowMs = Date.now(), timezone = "UTC"): Promise<number[]> {
  const from = localMidnightMs(nowMs, timezone) - 24 * 3600_000;
  return queryEdges((col) => between(col, from, nowMs));
}

/** The next local midnight after `nowMs`. Stepping 36 h from a midnight always lands mid-next-day, even across a clock change. */
export function nextLocalMidnightMs(nowMs: number, timezone: string): number {
  return localMidnightMs(localMidnightMs(nowMs, timezone) + 36 * 3600_000, timezone);
}

const FOLLOW_UP_AFTER_MS = 90_000;

/** Pure part of computeSiteNextAt: the earliest of the next midnight, a future window edge and an owed follow-up. */
export function nextSiteAt(nowMs: number, timezone: string, futureEdgesMs: number[], followUp: { requestedAt?: number; followedUp?: number }): number {
  const times = [nextLocalMidnightMs(nowMs, timezone), ...futureEdgesMs.filter((e) => e > nowMs)];
  const { requestedAt, followedUp } = followUp;
  if (requestedAt != null && requestedAt > (followedUp ?? 0)) times.push(requestedAt + FOLLOW_UP_AFTER_MS);
  return Math.min(...times);
}

/** When the public-site check next has work: the earliest of midnight, a future window edge and an owed follow-up. */
export async function computeSiteNextAt(nowMs: number, timezone: string, followUp: { requestedAt?: number; followedUp?: number }): Promise<number> {
  return nextSiteAt(nowMs, timezone, await queryEdges((col) => gt(col, nowMs)), followUp);
}
