import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, notificationOutbox, orders, users, walletLedger } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { awardCustomerBroadcast, listPayoutCandidates } from "../customer-payouts.service";

vi.mock("../app-settings.service", async (orig) => ({
  ...(await orig<typeof import("../app-settings.service")>()),
  getMaxWalletBalance: async () => 100,
}));

const emails = ["a", "b", "c", "d"].map((k) => `payouts-${k}@throwaway.local`);
const ids: Record<string, string> = {};
let userIds: bigint[] = [];

async function seed(
  snap: Awaited<ReturnType<typeof loadCatalogSnapshot>>,
  userId: bigint,
  tag: string,
  startDate: string,
  status: "active" | "completed" | "pending",
  lastDelivery?: string,
) {
  const [o] = await db.insert(orders).values({
    userId,
    planId: snap.plans[0].id,
    mealSizeId: snap.mealSizes[0].id,
    frequencyId: snap.frequencies[0].id,
    persons: 1,
    durationWeeks: 1,
    startDate,
    tiffinCount: 5,
    perTiffinPrice: "10.00",
    pricingSnapshot: {},
    total: "50.00",
    status,
    deploymentId: `PAYOUTS-${tag}`,
    fullName: "Test User",
    addressLine: "1 Test St",
    city: "Toronto",
    postalCode: "M5V 2T6",
  }).returning();
  if (lastDelivery) await db.insert(deliveries).values({ orderId: o.id, deliveryDate: lastDelivery, cutoffAt: 0 });
}

beforeAll(async () => {
  const snap = await loadCatalogSnapshot();
  const us = await db.insert(users).values(emails.map((email) => ({ email }))).returning();
  userIds = us.map((u) => u.id);
  const [a, b, c, d] = us;
  ids.a = a.publicId; ids.b = b.publicId; ids.c = c.publicId; ids.d = d.publicId;
  await seed(snap, a.id, "A1", "2030-02-04", "completed", "2030-02-10");
  await seed(snap, b.id, "B1", "2030-02-04", "active");
  await seed(snap, c.id, "C1", "2025-01-06", "completed", "2025-01-10");
  await seed(snap, c.id, "C2", "2025-02-01", "pending");
  await seed(snap, d.id, "D1", "2025-01-06", "completed", "2025-01-10");
});

afterAll(async () => {
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, userIds));
  await db.delete(walletLedger).where(inArray(walletLedger.userId, userIds));
  await db.delete(orders).where(inArray(orders.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
});

const has = async (f: Parameters<typeof listPayoutCandidates>[0], k: string) =>
  (await listPayoutCandidates(f, { limit: 5000 })).rows.some((r) => r.publicId === ids[k]);

describe("listPayoutCandidates plan filters", () => {
  it("lastTiffin range matches latest plan only", async () => {
    expect(await has({ lastTiffinTo: "2030-02-15" }, "a")).toBe(true);
    expect(await has({ lastTiffinTo: "2030-02-05" }, "a")).toBe(false);
  });

  it("no deliveries never matches", async () => {
    expect(await has({ lastTiffinTo: "2099-01-01" }, "b")).toBe(false);
    expect(await has({ lapsed: true }, "b")).toBe(false);
  });

  it("lapsed excludes later pending plan", async () => {
    expect(await has({ lapsed: true }, "c")).toBe(false);
    expect(await has({ lapsed: true }, "d")).toBe(true);
  });

  it("revenue op optional", async () => {
    const f = { revenueOp: null, revenueValue: null };
    expect(await has(f, "a")).toBe(true);
    expect(await has(f, "d")).toBe(true);
  });

  it("total reports count beyond limit", async () => {
    const r = await listPayoutCandidates({}, { limit: 1 });
    expect(r.rows.length).toBe(1);
    expect(r.total).toBeGreaterThanOrEqual(2);
  });
});

describe("awardCustomerBroadcast notifications", () => {
  it("enqueues one wallet_credited per awarded user with coins and reason; capped users get none", async () => {
    const [awardedUser, cappedUser] = userIds;
    await db.insert(walletLedger).values({
      userId: cappedUser, direction: "credit", sourceType: "test_fill", sourceId: `payouts-test:${cappedUser}`, coins: 100,
    });
    const r = await awardCustomerBroadcast([awardedUser, cappedUser], 10, undefined, null);
    expect(r).toMatchObject({ awarded: 1, capped: 1 });
    const rows = await db.select().from(notificationOutbox).where(inArray(notificationOutbox.recipientId, [awardedUser, cappedUser]));
    const credited = rows.filter((x) => x.event === "wallet_credited");
    expect(credited.map((x) => x.recipientId)).toEqual([awardedUser]);
    expect(credited[0].payload).toMatchObject({ vars: { wallet: { coins: "10", reason: "Staff gift" } } });
  });
});
