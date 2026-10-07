import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { and as cAnd, eq as cEq, like as cLike } from "@foundry/commons/model/condition";

// Local dev DB.
const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { paymentsService } = await import("../payments.service");
const { ledgerService } = await import("../ledger.service");

const MARK = "paylist-it";
const mine = cLike("email", `%${MARK}%`);
let userId: bigint;
let userPublicId: string;
let sessionId: bigint;

beforeEach(async () => {
  const [u] = await db
    .insert(schema.users)
    .values({ name: `${MARK} fam`, email: `${MARK}@example.test`, role: "user" })
    .returning({ id: schema.users.id, publicId: schema.users.publicId });
  userId = u!.id;
  userPublicId = u!.publicId;
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
  const [a, b] = await db
    .insert(schema.bookings)
    .values([
      { sessionId, userId, occurrenceId: occ!.id, seats: 1, status: "confirmed" },
      { sessionId, userId, occurrenceId: occ!.id, seats: 1, status: "cancelled" },
    ])
    .returning({ id: schema.bookings.id });
  await db.insert(schema.payments).values([
    { bookingId: a!.id, userId, status: "paid", method: "cash", amount: "20.00", currency: "CAD" },
    { bookingId: b!.id, userId, status: "pending_verification", method: "etransfer", amount: "5.00", currency: "CAD" },
  ]);
  await db.insert(schema.ledgerEntries).values({
    userId,
    bookingId: a!.id,
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

describe("all payments", () => {
  it("filters, pages and links each row to the family and the session date", async () => {
    const page = await paymentsService.listPage(cAnd(mine, cEq("status", "paid")), { page: 0, size: 25 }, { column: "time", dir: "desc" });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ status: "paid", amount: "20.00", customerPublicId: userPublicId });
    expect(page.items[0]!.occurrencePublicId).toMatch(/\w/);
  });

  it("sorts by amount", async () => {
    const page = await paymentsService.listPage(mine, { page: 0, size: 25 }, { column: "amount", dir: "asc" });
    expect(page.items.map((p) => p.amount)).toEqual(["5.00", "20.00"]);
  });

  it("stats count pending payments", async () => {
    const s = await paymentsService.paymentStats();
    expect(s.pending).toBeGreaterThanOrEqual(1);
    expect(Number(s.paidTotal)).toBeGreaterThanOrEqual(20);
  });
});

describe("ledger", () => {
  it("pages entries with the family and totals the filtered range", async () => {
    const page = await ledgerService.listPage(mine, { page: 0, size: 25 }, { column: "time", dir: "desc" });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ customerPublicId: userPublicId, amount: "20.00" });
    expect(await ledgerService.totals(mine)).toEqual({ credit: "20.00", debit: "0.00", net: "20.00" });
  });
});
