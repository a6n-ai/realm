import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { TEST_PRICING } from "./test-fixtures";

vi.mock("@/lib/services/app-settings.service", async (orig) => ({
  ...(await orig<typeof import("@/lib/services/app-settings.service")>()),
  getAppClock: async () => ({ timezone: "America/Toronto", currency: "CAD" }),
}));
vi.mock("@/lib/notifications/broadcast", () => ({ broadcastNotification: async () => {} }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { studioSessionsService } = await import("../studio-sessions.service");
const { addDayKey, dayKey } = await import("@/lib/sessions/timezone");

const MARK = "sessions-edit-it";
const occ = schema.studioSessionOccurrences;
const today = dayKey(new Date(), "America/Toronto");
const day = addDayKey(today, 20);
let classId: bigint;
let userId: bigint;
let occId: bigint;
let occPublicId: string;

const book = (seats: number) =>
  db.insert(schema.bookings).values({
    sessionId: classId,
    occurrenceId: occId,
    userId,
    seats,
    startsAt: new Date(`${day}T15:00:00Z`),
    endsAt: new Date(`${day}T16:00:00Z`),
    lengthMinutes: 60,
    status: "confirmed",
  });

beforeEach(async () => {
  const [u] = await db.insert(schema.users).values({ name: MARK, email: `${MARK}@example.test`, role: "user" }).returning({ id: schema.users.id });
  userId = u!.id;
  const [c] = await db
    .insert(schema.studioSessions)
    .values({ title: MARK, category: "kids", capacity: 6, pricing: TEST_PRICING })
    .returning({ id: schema.studioSessions.id });
  classId = c!.id;
  const [o] = await db
    .insert(occ)
    .values({ sessionId: classId, occursOn: day, startsAt: new Date(`${day}T15:00:00Z`), endsAt: new Date(`${day}T16:00:00Z`), capacity: 6 })
    .returning({ id: occ.id, publicId: occ.publicId });
  occId = o!.id;
  occPublicId = o!.publicId;
});

afterEach(async () => {
  const rows = await db.select({ id: occ.id }).from(occ).where(eq(occ.sessionId, classId));
  for (const r of rows) await db.delete(schema.bookings).where(eq(schema.bookings.occurrenceId, r.id));
  await db.delete(occ).where(eq(occ.sessionId, classId));
  await db.delete(schema.studioSessions).where(eq(schema.studioSessions.id, classId));
  await db.delete(schema.notifications).where(eq(schema.notifications.userId, userId));
  await db.delete(schema.users).where(eq(schema.users.id, userId));
});

describe("session edits", () => {
  it("cancel needs confirm when booked, then cancels bookings and notifies the parent", async () => {
    await book(2);
    await expect(studioSessionsService.cancelSession(occPublicId, { confirm: false })).rejects.toThrow(/Confirm/);
    expect(await studioSessionsService.cancelSession(occPublicId, { confirm: true })).toEqual({ cancelledBookings: 1 });
    const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.occurrenceId, occId));
    expect(b!.status).toBe("cancelled");
    const [o] = await db.select().from(occ).where(eq(occ.id, occId));
    expect(o!.status).toBe("cancelled");
    const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.title).toBe("Session cancelled");
    expect(notes[0]!.body).toContain(day);
  });

  it("an unbooked session cancels without confirm", async () => {
    expect(await studioSessionsService.cancelSession(occPublicId, { confirm: false })).toEqual({ cancelledBookings: 0 });
  });

  it("capacity can't drop below booked children", async () => {
    await book(3);
    await expect(studioSessionsService.updateSession(occPublicId, { capacity: 2 })).rejects.toThrow(/capacity/);
    await studioSessionsService.updateSession(occPublicId, { capacity: 3 });
    const [o] = await db.select().from(occ).where(eq(occ.id, occId));
    expect(o!.capacity).toBe(3);
    expect(o!.edited).toBe(true);
  });

  it("moving a booked session needs confirm, then cancels and says moved", async () => {
    await book(1);
    const to = addDayKey(day, 1);
    await expect(studioSessionsService.updateSession(occPublicId, { occursOn: to })).rejects.toThrow(/Confirm/);
    await studioSessionsService.updateSession(occPublicId, { occursOn: to, confirm: true });
    const [o] = await db.select().from(occ).where(eq(occ.id, occId));
    expect(o!.occursOn).toBe(to);
    const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.occurrenceId, occId));
    expect(b!.status).toBe("cancelled");
    const [n] = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId));
    expect(n!.title).toBe("Session moved");
  });

  it("rejects a price key the class doesn't offer", async () => {
    await expect(studioSessionsService.updateSession(occPublicId, { prices: { "len:999": { weekday: 5 } } })).rejects.toThrow(/does not match/);
  });

  it("unschedule refuses a session that has bookings", async () => {
    await book(1);
    await expect(studioSessionsService.unscheduleSession(occPublicId)).rejects.toThrow(/Cancel the session/);
  });
});

describe("copyWeek", () => {
  it("copies to the same weekday, keeps prices, and skips days already scheduled", async () => {
    await db.update(occ).set({ prices: { "len:60": { weekday: 9 } } }).where(eq(occ.id, occId));
    const from = addDayKey(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
    const to = addDayKey(from, 7);
    expect(await studioSessionsService.copyWeek(from, to)).toEqual({ copied: 1 });
    const target = addDayKey(day, 7);
    const [copy] = await db.select().from(occ).where(and(eq(occ.sessionId, classId), eq(occ.occursOn, target)));
    expect(copy!.edited).toBe(true);
    expect(copy!.prices).toEqual({ "len:60": { weekday: 9 } });
    expect(copy!.endsAt.getTime() - copy!.startsAt.getTime()).toBe(3_600_000);
    expect(await studioSessionsService.copyWeek(from, to)).toEqual({ copied: 0 });
  });
});
