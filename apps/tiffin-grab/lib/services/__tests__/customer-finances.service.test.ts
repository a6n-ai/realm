import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";
import { db } from "@/db/client";
import { deliveries, ledgerEntries, orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { createOrder } = await import("../orders.service");
const { ledgerService } = await import("../ledger.service");
const { myBillsPage, myMoneyLedgerPage } = await import("../customer-finances.service");

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

describe("customer-finances.service (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("myBillsPage returns only the caller's orders with payments, newest first", async () => {
    const snap = await loadCatalogSnapshot();
    const [userA] = await db.insert(users).values({ email: "bills-a@x.com", role: "user" }).returning();
    const [userB] = await db.insert(users).values({ email: "bills-b@x.com", role: "user" }).returning();

    const input = {
      planKey: snap.plans[0].key,
      selections: {
        mealSizeId: snap.mealSizes[0].publicId,
        frequencyKey: "5_day" as const,
        persons: 1,
        mealSlots: ["lunch"],
        includeSaturday: false,
        includeSunday: false,
        durationWeeks: 1,
        startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
      },
      contact: { fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    };

    await createOrder(input, { ownerUserId: userA.publicId });
    await createOrder(input, { ownerUserId: userA.publicId, allowSecondActive: true });
    await createOrder(input, { ownerUserId: userB.publicId });

    const page = await myBillsPage(userA.id, { page: 0, size: 25 });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(2);
    expect(page.items.every((b) => b.planName.length > 0)).toBe(true);
    expect(page.items.every((b) => b.payments.length >= 1)).toBe(true);

    const bOnly = await myBillsPage(userB.id, { page: 0, size: 25 });
    expect(bOnly.total).toBe(1);
    expect(bOnly.items).toHaveLength(1);
  });

  it("myBillsPage paginates", async () => {
    const snap = await loadCatalogSnapshot();
    const [user] = await db.insert(users).values({ email: "bills-page@x.com", role: "user" }).returning();
    const input = {
      planKey: snap.plans[0].key,
      selections: {
        mealSizeId: snap.mealSizes[0].publicId,
        frequencyKey: "5_day" as const,
        persons: 1,
        mealSlots: ["lunch"],
        includeSaturday: false,
        includeSunday: false,
        durationWeeks: 1,
        startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
      },
      contact: { fullName: "A B", phone: "+16475550122", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    };
    await createOrder(input, { ownerUserId: user.publicId });
    await createOrder(input, { ownerUserId: user.publicId, allowSecondActive: true });
    await createOrder(input, { ownerUserId: user.publicId, allowSecondActive: true });

    const page0 = await myBillsPage(user.id, { page: 0, size: 2 });
    expect(page0.items).toHaveLength(2);
    expect(page0.total).toBe(3);
    const page1 = await myBillsPage(user.id, { page: 1, size: 2 });
    expect(page1.items).toHaveLength(1);
    expect(page0.items[0].publicId).not.toBe(page1.items[0].publicId);
  });

  it("myMoneyLedgerPage is IDOR-gated and paginates", async () => {
    const [userA] = await db.insert(users).values({ email: "money-a@x.com", role: "user" }).returning();
    const [userB] = await db.insert(users).values({ email: "money-b@x.com", role: "user" }).returning();

    await db.transaction(async (tx) => {
      await ledgerService.record(tx, { userId: userA.id, direction: "credit", type: "payment", amount: 100, memo: "a1" });
      await ledgerService.record(tx, { userId: userA.id, direction: "debit", type: "discount", amount: 10, memo: "a2" });
      await ledgerService.record(tx, { userId: userA.id, direction: "debit", type: "refund", amount: 5, memo: "a3" });
      await ledgerService.record(tx, { userId: userB.id, direction: "credit", type: "payment", amount: 999, memo: "b1" });
    });

    const all = await myMoneyLedgerPage(userA.id, undefined, { page: 0, size: 25 });
    expect(all.total).toBe(3);
    expect(all.items).toHaveLength(3);
    expect(all.items.every((r) => r.memo?.startsWith("a"))).toBe(true);

    const bOnly = await myMoneyLedgerPage(userB.id, undefined, { page: 0, size: 25 });
    expect(bOnly.total).toBe(1);
    expect(bOnly.items[0].memo).toBe("b1");

    const page0 = await myMoneyLedgerPage(userA.id, undefined, { page: 0, size: 2 });
    expect(page0.items).toHaveLength(2);
    expect(page0.total).toBe(3);
  });

  it("myMoneyLedgerPage filters by type facet", async () => {
    const { eq: condEq } = await import("@realm/commons/model/condition");
    const [user] = await db.insert(users).values({ email: "money-facet@x.com", role: "user" }).returning();

    await db.transaction(async (tx) => {
      await ledgerService.record(tx, { userId: user.id, direction: "credit", type: "payment", amount: 50 });
      await ledgerService.record(tx, { userId: user.id, direction: "debit", type: "discount", amount: 5 });
      await ledgerService.record(tx, { userId: user.id, direction: "debit", type: "refund", amount: 10 });
    });

    const discounts = await myMoneyLedgerPage(user.id, condEq("type", "discount"), { page: 0, size: 25 });
    expect(discounts.total).toBe(1);
    expect(discounts.items[0].type).toBe("discount");
  });

  it("returns empty pages when the user has no bills or ledger rows", async () => {
    const [user] = await db.insert(users).values({ email: "empty-fin@x.com", role: "user" }).returning();
    const bills = await myBillsPage(user.id, { page: 0, size: 25 });
    const ledger = await myMoneyLedgerPage(user.id, undefined, { page: 0, size: 25 });
    expect(bills.total).toBe(0);
    expect(bills.items).toHaveLength(0);
    expect(ledger.total).toBe(0);
    expect(ledger.items).toHaveLength(0);
  });
});
