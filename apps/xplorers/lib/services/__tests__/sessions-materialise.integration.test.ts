import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { TEST_PRICING } from "./test-fixtures";

vi.mock("@/lib/services/app-settings.service", async (orig) => ({
  ...(await orig<typeof import("@/lib/services/app-settings.service")>()),
  getAppClock: async () => ({ timezone: "America/Toronto", currency: "CAD" }),
}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { studioSessionsService } = await import("../studio-sessions.service");
const { dayKey, addDayKey } = await import("@/lib/sessions/timezone");

const MARK = "materialise-it";
const today = dayKey(new Date(), "America/Toronto");
const occ = schema.studioSessionOccurrences;
let classId: bigint;
let classPublicId: string;
let userId: bigint;

const pattern = (weekdays: number[]) => ({
  weekdays,
  nthOfMonth: null,
  startClock: "09:30",
  endClock: "10:30",
  startsOn: addDayKey(today, -10),
  endsOn: null,
  excludeMonths: [],
});

const days = async () =>
  (await db.select().from(occ).where(eq(occ.sessionId, classId))).sort((a, b) => a.occursOn.localeCompare(b.occursOn));

beforeEach(async () => {
  const [u] = await db
    .insert(schema.users)
    .values({ name: MARK, email: `${MARK}@example.test`, role: "user" })
    .returning({ id: schema.users.id });
  userId = u!.id;
  const [c] = await db
    .insert(schema.studioSessions)
    .values({ title: MARK, category: "kids", capacity: 7, pricing: TEST_PRICING, pattern: pattern([1, 2, 3, 4, 5, 6, 7]) })
    .returning({ id: schema.studioSessions.id, publicId: schema.studioSessions.publicId });
  classId = c!.id;
  classPublicId = c!.publicId;
});

afterEach(async () => {
  const sessions = await db.select({ id: occ.id }).from(occ).where(eq(occ.sessionId, classId));
  for (const s of sessions) await db.delete(schema.bookings).where(eq(schema.bookings.occurrenceId, s.id));
  await db.delete(occ).where(eq(occ.sessionId, classId));
  await db.delete(schema.studioSessions).where(eq(schema.studioSessions.id, classId));
  await db.delete(schema.users).where(eq(schema.users.id, userId));
});

describe("session materialisation", () => {
  it("ensureHorizon is idempotent, uses the class window, and never revives a cancelled day", async () => {
    await studioSessionsService.ensureHorizon(classPublicId);
    const first = await days();
    expect(first[0]!.occursOn).toBe(today);
    expect(first.at(-1)!.occursOn).toBe(addDayKey(today, 92));
    expect(first).toHaveLength(93);
    expect(first[0]!.capacity).toBe(7);
    expect(first[0]!.endsAt.getTime() - first[0]!.startsAt.getTime()).toBe(3_600_000);

    await db.update(occ).set({ status: "cancelled" }).where(eq(occ.id, first[1]!.id));
    await studioSessionsService.ensureHorizon(classPublicId);
    const second = await days();
    expect(second).toHaveLength(93);
    expect(second[1]!.status).toBe("cancelled");
  });

  it("regenerateFuture keeps booked, edited and past sessions, swaps the rest", async () => {
    await studioSessionsService.ensureHorizon(classPublicId);
    const past = addDayKey(today, -3);
    const [pastRow] = await db
      .insert(occ)
      .values({ sessionId: classId, occursOn: past, startsAt: new Date(), endsAt: new Date(), capacity: 7 })
      .returning({ id: occ.id });
    const all = await days();
    const booked = all.find((d) => d.occursOn === addDayKey(today, 3))!;
    const edited = all.find((d) => d.occursOn === addDayKey(today, 5))!;
    await db.insert(schema.bookings).values({
      sessionId: classId,
      occurrenceId: booked.id,
      userId,
      startsAt: booked.startsAt,
      endsAt: booked.endsAt,
      lengthMinutes: 60,
      status: "cancelled",
    });
    await db.update(occ).set({ edited: true }).where(eq(occ.id, edited.id));

    await db.update(schema.studioSessions).set({ pattern: pattern([1]) }).where(eq(schema.studioSessions.id, classId));
    const result = await studioSessionsService.regenerateFuture(classPublicId);

    const after = await days();
    const keys = after.map((d) => d.occursOn);
    expect(keys).toContain(past);
    expect(keys).toContain(today);
    expect(keys).toContain(booked.occursOn);
    expect(keys).toContain(edited.occursOn);
    const keptExtra = new Set([past, today, booked.occursOn, edited.occursOn]);
    for (const d of after) {
      if (keptExtra.has(d.occursOn)) continue;
      expect(new Date(`${d.occursOn}T00:00:00Z`).getUTCDay()).toBe(1);
    }
    expect(result.removed).toBeGreaterThan(0);
    expect(result.added).toBeGreaterThan(0);
    expect(pastRow).toBeDefined();
  });

  it("the all-classes sweep skips classes already filled to the horizon", async () => {
    await studioSessionsService.ensureHorizon();
    const spy = vi.spyOn(db, "insert");
    await studioSessionsService.ensureHorizon();
    const inserts = spy.mock.calls.filter(([t]) => t === occ).length;
    spy.mockRestore();
    expect(inserts).toBe(0);
  });
});

describe("session identity and tombstones", () => {
  const ids = (rows: { occursOn: string; publicId: string }[]) => rows.map((r) => `${r.occursOn}:${r.publicId}`);

  it("saving an unchanged class keeps every future occurrence id", async () => {
    await studioSessionsService.ensureHorizon(classPublicId);
    const before = ids(await days());
    const [klass] = await db.select().from(schema.studioSessions).where(eq(schema.studioSessions.id, classId));
    const p = klass!.pattern!;
    // same pattern with jsonb-style key order and reversed arrays
    await studioSessionsService.updateClass(classPublicId, {
      title: MARK,
      category: "kids",
      capacity: 7,
      pattern: { endsOn: p.endsOn, excludeMonths: p.excludeMonths, endClock: p.endClock, weekdays: [...p.weekdays].reverse(), startsOn: p.startsOn, startClock: p.startClock, nthOfMonth: p.nthOfMonth },
    });
    expect(ids(await days())).toEqual(before);
  });

  it("samePattern compares structurally", async () => {
    const { samePattern } = await import("../studio-sessions.service");
    const p = pattern([1, 3]);
    expect(samePattern({ ...p, weekdays: [3, 1] }, p)).toBe(true);
    expect(samePattern({ ...p, weekdays: [1] }, p)).toBe(false);
    expect(samePattern(null, p)).toBe(false);
  });

  it("a moved pattern day is not recreated", async () => {
    await studioSessionsService.ensureHorizon(classPublicId);
    const target = (await days()).find((d) => d.occursOn === addDayKey(today, 10))!;
    const newDay = addDayKey(today, 200);
    await studioSessionsService.updateSession(target.publicId, { occursOn: newDay });
    await studioSessionsService.ensureHorizon(classPublicId);
    await studioSessionsService.regenerateFuture(classPublicId);
    const rows = await days();
    const old = rows.filter((d) => d.occursOn === target.occursOn);
    expect(old).toHaveLength(1);
    expect(old[0]!.status).toBe("cancelled");
    expect(rows.find((d) => d.occursOn === newDay)!.publicId).toBe(target.publicId);
  });

  it("an unscheduled pattern day is not recreated", async () => {
    await studioSessionsService.ensureHorizon(classPublicId);
    const target = (await days()).find((d) => d.occursOn === addDayKey(today, 12))!;
    await studioSessionsService.unscheduleSession(target.publicId);
    await studioSessionsService.ensureHorizon(classPublicId);
    await studioSessionsService.regenerateFuture(classPublicId);
    const rows = (await days()).filter((d) => d.occursOn === target.occursOn);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("cancelled");
  });
});
