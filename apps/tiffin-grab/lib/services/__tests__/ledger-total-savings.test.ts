import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { ledgerEntries, users } = await import("@/db/schema");
const { ledgerService } = await import("../ledger.service");

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(users).where(ne(users.isSystem, true));
}

describe("ledgerService.totalSavings (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("sums discount debits only, scoped to the caller, ignoring payment/refund", async () => {
    const [userA] = await db.insert(users).values({ email: "saver-a@x.com", role: "user" }).returning();
    const [userB] = await db.insert(users).values({ email: "saver-b@x.com", role: "user" }).returning();

    await db.transaction(async (tx) => {
      await ledgerService.record(tx, { userId: userA.id, direction: "debit", type: "discount", amount: 25 });
      await ledgerService.record(tx, { userId: userA.id, direction: "credit", type: "payment", amount: 100 });
      await ledgerService.record(tx, { userId: userA.id, direction: "debit", type: "refund", amount: 10 });
      // another user's discount must not leak into A's total.
      await ledgerService.record(tx, { userId: userB.id, direction: "debit", type: "discount", amount: 999 });
    });

    expect(await ledgerService.totalSavings(userA.id)).toBe("25.00");
  });

  it("returns 0.00 when the caller has no discount rows", async () => {
    const [user] = await db.insert(users).values({ email: "saver-c@x.com", role: "user" }).returning();
    await db.transaction((tx) => ledgerService.record(tx, { userId: user.id, direction: "credit", type: "payment", amount: 50 }));

    expect(await ledgerService.totalSavings(user.id)).toBe("0.00");
  });
});
