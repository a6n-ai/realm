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
});
