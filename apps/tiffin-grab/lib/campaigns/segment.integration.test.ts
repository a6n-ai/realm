import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { resolveSegment } from "./segment";

const MARK = "campaign-segment";
const created: bigint[] = [];
const createdOrders: bigint[] = [];

async function makeUser(suffix: string, phoneVerified = false): Promise<bigint> {
  const [u] = await db
    .insert(users)
    .values({ email: `${MARK}-${suffix}@throwaway.local`, phoneVerified })
    .returning({ id: users.id });
  created.push(u.id);
  return u.id;
}

async function makeOrder(userId: bigint, deploymentId: string, snap: Awaited<ReturnType<typeof loadCatalogSnapshot>>) {
  const [o] = await db
    .insert(orders)
    .values({
      userId,
      planId: snap.plans[0].id,
      mealSizeId: snap.mealSizes[0].id,
      frequencyId: snap.frequencies[0].id,
      persons: 1,
      durationWeeks: 1,
      startDate: "2030-01-06",
      tiffinCount: 5,
      perTiffinPrice: "10.00",
      pricingSnapshot: {},
      total: "50.00",
      status: "active",
      deploymentId,
      fullName: "Test User",
      addressLine: "1 Test St",
      city: "Toronto",
      postalCode: "M5V 2T6",
    })
    .returning({ id: orders.id });
  createdOrders.push(o.id);
  return o.id;
}

afterAll(async () => {
  if (createdOrders.length) await db.delete(orders).where(inArray(orders.id, createdOrders));
  if (created.length) await db.delete(users).where(inArray(users.id, created));
});

describe("resolveSegment: minOrderCount", () => {
  let twoOrderUser: bigint;
  let oneOrderUser: bigint;

  beforeAll(async () => {
    const snap = await loadCatalogSnapshot();
    twoOrderUser = await makeUser("min-two-orders");
    oneOrderUser = await makeUser("min-one-order");
    await makeOrder(twoOrderUser, `${MARK}-MIN-01`, snap);
    await makeOrder(twoOrderUser, `${MARK}-MIN-02`, snap);
    await makeOrder(oneOrderUser, `${MARK}-MIN-03`, snap);
  });

  it("returns only users meeting minOrderCount", async () => {
    const ids = await resolveSegment({ minOrderCount: 2 });
    expect(ids).toEqual(expect.arrayContaining([twoOrderUser]));
    expect(ids).not.toEqual(expect.arrayContaining([oneOrderUser]));
  });
});

describe("resolveSegment: requireVerifiedPhone", () => {
  let verifiedUser: bigint;
  let unverifiedUser: bigint;

  beforeAll(async () => {
    const snap = await loadCatalogSnapshot();
    verifiedUser = await makeUser("verified", true);
    unverifiedUser = await makeUser("unverified", false);
    await makeOrder(verifiedUser, `${MARK}-VER-01`, snap);
    await makeOrder(unverifiedUser, `${MARK}-VER-02`, snap);
  });

  it("filters to verified phones when requireVerifiedPhone is set", async () => {
    const ids = await resolveSegment({ requireVerifiedPhone: true });
    expect(ids).toEqual(expect.arrayContaining([verifiedUser]));
    expect(ids).not.toEqual(expect.arrayContaining([unverifiedUser]));
  });
});
