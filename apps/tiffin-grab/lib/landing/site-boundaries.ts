import { isNotNull, or } from "drizzle-orm";
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
  return Math.max(localMidnightMs(nowMs, timezone), ...windowEdgesMs.filter((e) => e <= nowMs));
}

// Live-only service lists drop a window the moment it ends, which is exactly the edge we need,
// so read the window columns of every row.
export async function loadWindowEdges(): Promise<number[]> {
  const [p, c, d] = await Promise.all([
    db.select({ a: promotions.startsAt, b: promotions.endsAt }).from(promotions).where(or(isNotNull(promotions.startsAt), isNotNull(promotions.endsAt))),
    db.select({ a: coupons.startsAt, b: coupons.expiresAt }).from(coupons).where(or(isNotNull(coupons.startsAt), isNotNull(coupons.expiresAt))),
    db.select({ a: discounts.startsAt, b: discounts.endsAt }).from(discounts).where(or(isNotNull(discounts.startsAt), isNotNull(discounts.endsAt))),
  ]);
  return [...p, ...c, ...d].flatMap((r) => [r.a, r.b]).filter((e): e is number => e != null);
}
