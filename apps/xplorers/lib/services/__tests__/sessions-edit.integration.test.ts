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
const { bookingsService } = await import("../bookings.service");
const { addDayKey, dayKey } = await import("@/lib/sessions/timezone");

const MARK = "sessions-edit-it";
const occ = schema.studioSessionOccurrences;
const today = dayKey(new Date(), "America/Toronto");
const day = addDayKey(today, 20);
let classId: bigint;
let userId: bigint;
let otherId: bigint;
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
  const [u2] = await db.insert(schema.users).values({ name: MARK, email: `${MARK}-2@example.test`, role: "user" }).returning({ id: schema.users.id });
  otherId = u2!.id;
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
  await db.delete(schema.notifications).where(eq(schema.notifications.userId, otherId));
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  await db.delete(schema.users).where(eq(schema.users.id, otherId));
  vi.restoreAllMocks();
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

  it("a booking cancelled under our feet still ends with a cancelled session and one notification", async () => {
    await book(1);
    await db.insert(schema.bookings).values({
      sessionId: classId, occurrenceId: occId, userId: otherId, seats: 1,
      startsAt: new Date(`${day}T15:00:00Z`), endsAt: new Date(`${day}T16:00:00Z`), lengthMinutes: 60, status: "confirmed",
    });
    const real = bookingsService.cancel.bind(bookingsService);
    let first = true;
    vi.spyOn(bookingsService, "cancel").mockImplementation(async (id: string) => {
      await real(id);
      if (first) {
        first = false;
        await real(id);
      }
    });
    await studioSessionsService.cancelSession(occPublicId, { confirm: true });
    const [o] = await db.select().from(occ).where(eq(occ.id, occId));
    expect(o!.status).toBe("cancelled");
    const bs = await db.select().from(schema.bookings).where(eq(schema.bookings.occurrenceId, occId));
    expect(bs.every((b) => b.status === "cancelled")).toBe(true);
    const notes = [
      ...(await db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId))),
      ...(await db.select().from(schema.notifications).where(eq(schema.notifications.userId, otherId))),
    ];
    expect(notes).toHaveLength(1);
  });

  it("a failed booking cancel can be finished by retrying cancel", async () => {
    await book(1);
    const spy = vi.spyOn(bookingsService, "cancel").mockRejectedValueOnce(new Error("boom"));
    await expect(studioSessionsService.cancelSession(occPublicId, { confirm: true })).rejects.toThrow(/1 of 1/);
    spy.mockRestore();
    const [mid] = await db.select().from(schema.bookings).where(eq(schema.bookings.occurrenceId, occId));
    expect(mid!.status).toBe("confirmed");
    expect(await studioSessionsService.cancelSession(occPublicId, { confirm: true })).toEqual({ cancelledBookings: 1 });
    const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.occurrenceId, occId));
    const [o] = await db.select().from(occ).where(eq(occ.id, occId));
    expect([b!.status, o!.status]).toEqual(["cancelled", "cancelled"]);
  });

  it("a failed booking cancel during a move is finished by repeating the edit", async () => {
    await book(1);
    const to = addDayKey(day, 1);
    const spy = vi.spyOn(bookingsService, "cancel").mockRejectedValueOnce(new Error("boom"));
    await expect(studioSessionsService.updateSession(occPublicId, { occursOn: to, confirm: true })).rejects.toThrow(/1 of 1/);
    spy.mockRestore();
    await expect(studioSessionsService.updateSession(occPublicId, { occursOn: to })).rejects.toThrow(/Confirm/);
    await studioSessionsService.updateSession(occPublicId, { occursOn: to, confirm: true });
    const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.occurrenceId, occId));
    expect(b!.status).toBe("cancelled");
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
    const from = "2031-03-03";
    const to = "2031-03-10";
    const src = "2031-03-05";
    await db.update(occ).set({
      occursOn: src,
      startsAt: new Date(`${src}T15:00:00Z`),
      endsAt: new Date(`${src}T16:00:00Z`),
      prices: { "len:60": { weekday: 9 } },
    }).where(eq(occ.id, occId));
    expect(await studioSessionsService.copyWeek(from, to)).toEqual({ copied: 1 });
    const target = "2031-03-12";
    const [copy] = await db.select().from(occ).where(and(eq(occ.sessionId, classId), eq(occ.occursOn, target)));
    expect(copy!.edited).toBe(true);
    expect(copy!.prices).toEqual({ "len:60": { weekday: 9 } });
    expect(copy!.endsAt.getTime() - copy!.startsAt.getTime()).toBe(3_600_000);
    expect(await studioSessionsService.copyWeek(from, to)).toEqual({ copied: 0 });
  });
});
