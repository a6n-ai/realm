import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { coupons, promotions } from "@/db/schema";
import { like } from "drizzle-orm";
import { computeSiteNextAt, lastBoundary, loadWindowEdges, nextLocalMidnightMs, nextSiteAt } from "../site-boundaries";

const TZ = "America/Toronto";

describe("lastBoundary", () => {
  it("returns Monday 00:00 America/Toronto just after midnight", () => {
    // 2026-11-09 is a Monday (EST, UTC-5)
    const now = Date.parse("2026-11-09T05:00:30Z");
    expect(lastBoundary(now, TZ, [])).toBe(Date.parse("2026-11-09T05:00:00Z"));
  });

  it("picks a promo end that is later than midnight", () => {
    const now = Date.parse("2026-11-09T15:00:00Z");
    const end = Date.parse("2026-11-09T12:00:00Z");
    expect(lastBoundary(now, TZ, [end])).toBe(end);
  });

  it("ignores future edges", () => {
    const now = Date.parse("2026-11-09T15:00:00Z");
    expect(lastBoundary(now, TZ, [now + 1000])).toBe(Date.parse("2026-11-09T05:00:00Z"));
  });

  it("handles the DST change day", () => {
    // 2026-11-01: clocks fall back at 02:00 EDT; midnight is still EDT (UTC-4)
    const now = Date.parse("2026-11-01T20:00:00Z");
    expect(lastBoundary(now, TZ, [])).toBe(Date.parse("2026-11-01T04:00:00Z"));
    // the next day's midnight is EST (UTC-5)
    expect(lastBoundary(Date.parse("2026-11-02T10:00:00Z"), TZ, [])).toBe(Date.parse("2026-11-02T05:00:00Z"));
  });
});

describe("loadWindowEdges", () => {
  const now = Date.parse("2026-11-09T15:00:00Z");
  const recent = now - 3600_000;
  const old = now - 10 * 24 * 3600_000;
  const base = { name: "zz-edge", kind: "percentage" } as const;

  afterEach(async () => {
    await db.delete(coupons).where(like(coupons.code, "ZZEDGE%"));
    await db.delete(promotions).where(like(promotions.title, "zz-edge%"));
  });

  it("keeps public coupon and promo edges in range, drops staff, hidden, inactive and old ones", async () => {
    await db.insert(coupons).values([
      { ...base, code: "ZZEDGE-PUBLIC", expiresAt: recent },
      { ...base, code: "ZZEDGE-REP", kind: "rep_code" as const, expiresAt: recent + 1 },
      { ...base, code: "ZZEDGE-HIDDEN", visible: false, expiresAt: recent + 2 },
      { ...base, code: "ZZEDGE-OFF", active: false, expiresAt: recent + 3 },
      { ...base, code: "ZZEDGE-OLD", expiresAt: old },
    ]);
    await db.insert(promotions).values({ title: "zz-edge-promo", endsAt: recent + 4 });
    const edges = await loadWindowEdges(now, "America/Toronto");
    expect(edges).toContain(recent);
    expect(edges).toContain(recent + 4);
    for (const n of [1, 2, 3]) expect(edges).not.toContain(recent + n);
    expect(edges).not.toContain(old);
  });
});

describe("nextLocalMidnightMs / nextSiteAt", () => {
  const edge = Date.parse("2026-11-09T20:00:00Z");
  const now = Date.parse("2026-11-09T15:00:00Z");

  it("is the next local midnight when nothing else is due", () => {
    expect(nextSiteAt(now, TZ, [], {})).toBe(Date.parse("2026-11-10T05:00:00Z"));
  });

  it("handles the DST days", () => {
    // fall back 2026-11-01: midnight EDT (04:00Z) to midnight EST (05:00Z) the next day
    expect(nextLocalMidnightMs(Date.parse("2026-11-01T10:00:00Z"), TZ)).toBe(Date.parse("2026-11-02T05:00:00Z"));
    // spring forward 2026-03-08: midnight EST (05:00Z) to midnight EDT (04:00Z)
    expect(nextLocalMidnightMs(Date.parse("2026-03-08T10:00:00Z"), TZ)).toBe(Date.parse("2026-03-09T04:00:00Z"));
  });

  it("prefers a sooner future edge and ignores past ones", () => {
    expect(nextSiteAt(now, TZ, [edge, now - 1000], {})).toBe(edge);
  });

  it("is requestedAt + 90 s while a follow-up is owed, not after it ran", () => {
    expect(nextSiteAt(now, TZ, [edge], { requestedAt: now - 10_000, followedUp: 0 })).toBe(now + 80_000);
    expect(nextSiteAt(now, TZ, [edge], { requestedAt: now - 10_000, followedUp: now - 10_000 })).toBe(edge);
  });
});

describe("computeSiteNextAt", () => {
  const now = Date.parse("2026-11-09T15:00:00Z");
  afterEach(async () => {
    await db.delete(promotions).where(like(promotions.title, "zz-next%"));
  });

  it("picks up an upcoming promo edge from the database", async () => {
    const soon = now + 3600_000;
    await db.insert(promotions).values({ title: "zz-next-promo", startsAt: soon });
    expect(await computeSiteNextAt(now, TZ, {})).toBe(soon);
  });
});
