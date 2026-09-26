import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";
import { db } from "@/db/client";
import { customerAddresses, deliveries, ledgerEntries, orders, payments, users } from "@/db/schema";
import { invalidateCatalogSnapshot, loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@foundry/places", async (orig) => ({ ...(await orig<object>()), resolveAndPersist: async () => null }));
const { createOrder } = await import("../orders.service");
const { addressService } = await import("../addresses.service");

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true)); // cascades customer_addresses
  await invalidateCatalogSnapshot();
}

const CONTACT = {
  fullName: "Addr Customer",
  phone: "+16475550333",
  email: "addrcustomer@test.invalid",
  addressLine: "100 King St W",
  city: "Toronto",
  postalCode: "M5V 2T6",
};

async function input(extra: Record<string, unknown> = {}) {
  const snap = await loadCatalogSnapshot();
  return {
    planKey: snap.plans[0]!.key,
    selections: {
      mealSizeId: snap.mealSizes[0]!.publicId,
      frequencyKey: "5_day",
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { ...CONTACT },
    ...extra,
  };
}

const orderBy = async (publicId: string) => (await db.select().from(orders).where(eq(orders.publicId, publicId)))[0]!;

describe("createOrder links a saved address", () => {
  beforeEach(reset);
  afterAll(reset);

  it("guest checkout saves the typed address as the new customer's default and links the plan", async () => {
    const { publicId } = await createOrder(await input());
    const order = await orderBy(publicId);
    const saved = await db.select().from(customerAddresses).where(eq(customerAddresses.userId, order.userId!));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ label: "Home", isDefault: true, addressLine: "100 King St W" });
    expect(order.addressId).toBe(saved[0]!.id);
  });

  it("a picked saved address is linked and becomes the snapshot; the default is unchanged", async () => {
    const first = await createOrder(await input());
    const userId = (await orderBy(first.publicId)).userId!;
    const work = await addressService.create({ userId, orgId: null }, { label: "Work", addressLine: "200 Bay St", city: "Toronto", postalCode: "M5J 2J1" });
    // Concurrent plans aren't allowed; end the first so the second can start.
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.publicId, first.publicId));

    const { publicId } = await createOrder(await input({ addressPublicId: work.publicId }));
    const order = await orderBy(publicId);
    expect(order.addressId).toBe(work.id);
    expect(order.addressLine).toBe("200 Bay St");
    expect(order.postalCode).toBe("M5J 2J1");
    const defaults = await db.select().from(customerAddresses).where(eq(customerAddresses.userId, userId));
    expect(defaults.find((a) => a.isDefault)?.label).toBe("Home");
  });

  it("rejects another customer's saved address", async () => {
    const first = await createOrder(await input());
    const otherUser = (await orderBy(first.publicId)).userId!;
    const foreign = await addressService.create({ userId: otherUser, orgId: null }, { label: "Theirs", addressLine: "1 A St", city: "Toronto", postalCode: "M5J 2J1" });
    const stranger = await input({ addressPublicId: foreign.publicId });
    stranger.contact = { ...CONTACT, phone: "+16475550444", email: "stranger@test.invalid" };
    await expect(createOrder(stranger)).rejects.toThrow("Address not found");
  });
});
