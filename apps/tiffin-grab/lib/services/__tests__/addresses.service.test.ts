import { beforeEach, describe, expect, it, vi } from "vitest";
import { count, eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { customerAddresses, deliveries, orders, users } from "@/db/schema";
import { makeTripOrder, resetTrips } from "./trip-fixture";

vi.mock("@/lib/services/session-service", async (orig) => ({ ...(await orig<object>()), currentUserId: async () => null }));
vi.mock("@/lib/tenant/resolve-request-org", () => ({ resolveRequestOrg: async () => null }));
// Geocoding is irrelevant here and must not hit AWS.
vi.mock("@foundry/places", async (orig) => ({ ...(await orig<object>()), resolveAndPersist: async () => null }));

const { addressService } = await import("../addresses.service");

const DEP = "addr-book-test";
const DEP_OTHER = "addr-book-test-other";
const PREFIX_OTHER = "addrbookother_";
const PREFIX = "addrbook_";
const HOME = { label: "Home", fullName: "Trip Tester", addressLine: "9 Bay St", city: "Toronto", postalCode: "M5J 2T3" };
const WORK = { label: "Work", addressLine: "200 Bay St", city: "Toronto", postalCode: "M5J 2J1" };

async function cleanupOne(dep: string, prefix: string) {
  const mine = db.select({ id: users.id }).from(users).where(like(users.email, `${prefix}%@test.invalid`));
  const myOrders = db.select({ id: orders.id }).from(orders).where(inArray(orders.userId, mine));
  // orders/deliveries → customer_addresses FKs must be cleared before the fixture deletes users.
  await db.update(deliveries).set({ addressId: null }).where(inArray(deliveries.orderId, myOrders));
  await db.update(orders).set({ addressId: null }).where(inArray(orders.userId, mine));
  await db.delete(customerAddresses).where(inArray(customerAddresses.userId, mine));
  await resetTrips(dep, prefix);
}
const cleanup = async () => {
  await cleanupOne(DEP_OTHER, PREFIX_OTHER);
  await cleanupOne(DEP, PREFIX);
};

async function setup() {
  const trip = await makeTripOrder(DEP, PREFIX);
  const scope = { userId: trip.order.userId!, orgId: null };
  const home = await addressService.create(scope, HOME);
  await db.update(orders).set({ addressId: home.id }).where(eq(orders.id, trip.order.id));
  // Mon becomes past-cutoff (frozen); Wed/Fri stay editable.
  await db.update(deliveries).set({ cutoffAt: Date.now() - 60_000 }).where(eq(deliveries.id, trip.mon.id));
  return { ...trip, scope, home };
}
const delivery = async (id: bigint) => (await db.select().from(deliveries).where(eq(deliveries.id, id)))[0]!;
const orderRow = async (id: bigint) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!;

describe("addressService (tiffin-grab hooks)", () => {
  beforeEach(cleanup);

  it("first address becomes the default; setDefault leaves one default", async () => {
    const { scope, home } = await setup();
    expect(home.isDefault).toBe(true);
    const work = await addressService.create(scope, WORK);
    expect(work.isDefault).toBe(false);
    await addressService.setDefault(scope, work.publicId);
    const all = await db.select().from(customerAddresses).where(eq(customerAddresses.userId, scope.userId));
    expect(all.filter((a) => a.isDefault).map((a) => a.label)).toEqual(["Work"]);
  });

  it("edit updates the plan snapshot; editable inheriting deliveries follow it", async () => {
    const { scope, home, order, wed } = await setup();
    await addressService.update(scope, home.publicId, { ...HOME, addressLine: "11 Bay St" });
    expect((await orderRow(order.id)).addressLine).toBe("11 Bay St");
    expect((await delivery(wed.id)).addressLine).toBeNull(); // still inherits → now 11 Bay St
  });

  it("freezes inheriting past deliveries before changing the order snapshot", async () => {
    const { scope, home, mon } = await setup();
    expect((await delivery(mon.id)).addressLine).toBeNull();
    await addressService.update(scope, home.publicId, { ...HOME, addressLine: "11 Bay St" });
    const frozen = await delivery(mon.id);
    expect(frozen.addressLine).toBe("9 Bay St");
    expect(frozen.postalCode).toBe("M5J 2T3");
  });

  it("refuses out-of-zone edit atomically", async () => {
    const { scope, home, order, mon } = await setup();
    await expect(addressService.update(scope, home.publicId, { ...HOME, postalCode: "K1A 0B1" })).rejects.toThrow(/don't deliver/);
    const [addr] = await db.select().from(customerAddresses).where(eq(customerAddresses.id, home.id));
    expect(addr!.postalCode).toBe("M5J 2T3");
    expect((await orderRow(order.id)).postalCode).toBe("M5J 2T3");
    expect((await delivery(mon.id)).addressLine).toBeNull(); // freeze rolled back too
  });

  it("archive moves editable deliveries to the default and leaves frozen ones", async () => {
    const { scope, home, mon, wed } = await setup();
    const work = await addressService.create(scope, WORK);
    const workSnap = { addressId: work.id, addressLine: WORK.addressLine, city: WORK.city, postalCode: WORK.postalCode, fullName: "Trip Tester" };
    await db.update(deliveries).set(workSnap).where(inArray(deliveries.id, [mon.id, wed.id]));
    await addressService.archive(scope, work.publicId);
    const movedWed = await delivery(wed.id);
    expect(movedWed.addressId).toBe(home.id);
    expect(movedWed.addressLine).toBe("9 Bay St");
    const keptMon = await delivery(mon.id);
    expect(keptMon.addressId).toBe(work.id);
    expect(keptMon.addressLine).toBe("200 Bay St");
    const [rows] = await db.select({ n: count() }).from(customerAddresses).where(eq(customerAddresses.userId, scope.userId));
    expect(rows!.n).toBe(2); // archived, not deleted
    expect((await addressService.list(scope)).map((a) => a.label)).toEqual(["Home"]);
  });

  it("refuses archiving the default while others exist", async () => {
    const { scope, home } = await setup();
    await addressService.create(scope, WORK);
    await expect(addressService.archive(scope, home.publicId)).rejects.toThrow("Make another address the default first");
  });

  it("rejects foreign address", async () => {
    const { home } = await setup();
    const other = await makeTripOrder(DEP_OTHER, PREFIX_OTHER);
    await expect(addressService.getRow({ userId: other.order.userId!, orgId: null }, home.publicId)).rejects.toThrow("Address not found");
  });

  it("two concurrent first addresses for a new customer both save, with exactly one default", async () => {
    const trip = await makeTripOrder(DEP, PREFIX);
    const scope = { userId: trip.order.userId!, orgId: null };
    const results = await Promise.allSettled([
      addressService.create(scope, HOME),
      addressService.create(scope, WORK),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    const rows = await db.select().from(customerAddresses).where(eq(customerAddresses.userId, scope.userId));
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1);
  });

  it("the out-of-zone refusal counts deliveries in plain English", async () => {
    const { scope, home, fri } = await setup();
    await expect(addressService.update(scope, home.publicId, { ...HOME, postalCode: "K1A 0B1" }))
      .rejects.toThrow("We don't deliver to K1A 0B1 — 2 upcoming deliveries use this address");
    await db.update(deliveries).set({ cutoffAt: Date.now() - 60_000 }).where(eq(deliveries.id, fri.id));
    await expect(addressService.update(scope, home.publicId, { ...HOME, postalCode: "K1A 0B1" }))
      .rejects.toThrow("We don't deliver to K1A 0B1 — 1 upcoming delivery uses this address");
  });
});
