import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

// Local dev DB.
const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { listCustomersPage, customerStats } = await import("../customers.service");

const MARK = "cust-it";
const byMark = { type: "filter", field: "email", operator: "like", value: `%${MARK}%` } as const;
let userId: bigint;
let sessionId: bigint;

beforeEach(async () => {
  const [u] = await db
    .insert(schema.users)
    .values({ name: `${MARK} fam`, email: `${MARK}@example.test`, role: "user" })
    .returning({ id: schema.users.id });
  userId = u!.id;
  const startsAt = new Date(Date.now() + 86_400_000);
  const [s] = await db
    .insert(schema.studioSessions)
    .values({
      title: `${MARK} class`,
      category: "kids",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      capacity: 10,
      priceAmount: "20.00",
      published: true,
    })
    .returning({ id: schema.studioSessions.id });
  sessionId = s!.id;
  const [occ] = await db
    .insert(schema.studioSessionOccurrences)
    .values({ sessionId, occursOn: startsAt.toISOString().slice(0, 10) })
    .returning({ id: schema.studioSessionOccurrences.id });
  const [live, cancelled] = await db
    .insert(schema.bookings)
    .values([
      { sessionId, userId, occurrenceId: occ!.id, seats: 1, status: "confirmed" },
      { sessionId, userId, occurrenceId: occ!.id, seats: 1, status: "cancelled" },
    ])
    .returning({ id: schema.bookings.id });
  await db.insert(schema.payments).values([
    { bookingId: live!.id, userId, status: "paid", method: "cash", amount: "20.00", currency: "CAD" },
    { bookingId: cancelled!.id, userId, status: "rejected", method: "cash", amount: "20.00", currency: "CAD" },
  ]);
  await db.insert(schema.ledgerEntries).values({
    userId,
    bookingId: live!.id,
    direction: "credit",
    type: "payment",
    amount: "20.00",
    currency: "CAD",
  });
});

afterEach(async () => {
  await db.delete(schema.ledgerEntries).where(eq(schema.ledgerEntries.userId, userId));
  await db.delete(schema.payments).where(eq(schema.payments.userId, userId));
  await db.delete(schema.bookings).where(eq(schema.bookings.userId, userId));
  await db.delete(schema.studioSessionOccurrences).where(eq(schema.studioSessionOccurrences.sessionId, sessionId));
  await db.delete(schema.studioSessions).where(eq(schema.studioSessions.id, sessionId));
  await db.delete(schema.users).where(eq(schema.users.id, userId));
});

describe("customers list", () => {
  it("counts live bookings and only paid money", async () => {
    const page = await listCustomersPage(byMark, { page: 0, size: 25 });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ bookingCount: 1, totalSpent: "20.00" });
    expect(page.items[0]!.lastBookingAt).toEqual(expect.any(Number));
  });

  it("never lists staff", async () => {
    const [staff] = await db
      .insert(schema.users)
      .values({ name: `${MARK} staff`, email: `${MARK}-staff@example.test`, role: "admin" })
      .returning({ id: schema.users.id });
    try {
      const page = await listCustomersPage(byMark, { page: 0, size: 25 });
      expect(page.items.map((r) => r.email)).toEqual([`${MARK}@example.test`]);
    } finally {
      await db.delete(schema.users).where(eq(schema.users.id, staff!.id));
    }
  });

  it("stats include the new family", async () => {
    const s = await customerStats();
    expect(s.withBookings).toBeGreaterThanOrEqual(1);
    expect(s.newThisWeek).toBeGreaterThanOrEqual(1);
    expect(s.total).toBeGreaterThanOrEqual(s.active);
  });
});
