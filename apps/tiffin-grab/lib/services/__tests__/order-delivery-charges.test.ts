import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";
import { db } from "@/db/client";
import { addressTags, deliveries, deliveryChargeConfigs, deliveryStrategies, deliveryStrategyConnections, deliveryStrategyGroups, ledgerEntries, orders, payments, users, customerAddresses } from "@/db/schema";
import { loadCatalogSnapshot, invalidateCatalogSnapshot } from "@/lib/catalog/load";
import { deliveryService } from "../delivery.service";
import { reprice } from "@/app/(public)/subscribe/actions";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { createOrder } = await import("../orders.service");

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(payments);
  await db.delete(orders);
  // Checkout saves the chosen drop-off onto a new address; unhook it before strategies go.
  await db.update(customerAddresses).set({ deliveryStrategyId: null, deliveryStrategyIds: [], deliveryTagId: null });
  await db.delete(deliveryStrategies);
  await db.delete(deliveryStrategyConnections);
  await db.delete(deliveryStrategyGroups);
  await db.delete(addressTags);
  await db.delete(deliveryChargeConfigs);
  await db.delete(users).where(ne(users.isSystem, true));
  await invalidateCatalogSnapshot();
}

describe("Order Delivery Charges (Integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("persists deliveryCharge, deliveryTagId, deliveryStrategyIds, addressTagId and immutable pricingSnapshot", async () => {
    // 1. Configure delivery rules
    await deliveryService.updateBaseDeliveryCharge(2); // Base = $2.00
    const spot = await deliveryService.saveDeliveryStrategyGroup({ name: "Apartment" });
    const home = await deliveryService.saveDeliveryStrategyGroup({ name: "Home" });
    const dt = await deliveryService.saveDeliveryStrategy({
      name: "Doorstep",
      chargeType: "fixed",
      chargeValue: 1.5,
      groupId: spot.id,
    });
    const lobby = await deliveryService.saveDeliveryStrategy({ name: "Lobby", chargeType: "none", chargeValue: 0, groupId: spot.id });
    const porch = await deliveryService.saveDeliveryStrategy({ name: "Porch", chargeType: "none", chargeValue: 0, groupId: home.id });
    await deliveryService.connectDeliveryStrategy(dt.id, [lobby.id]);
    const call = await deliveryService.saveDeliveryStrategy({
      name: "Call on arrival",
      chargeType: "fixed",
      chargeValue: 0.5,
      groupId: spot.id,
    });
    expect(dt.groupId).toBe(spot.id);
    // Connections never span tags.
    await expect(deliveryService.connectDeliveryStrategy(dt.id, [porch.id])).rejects.toThrow("own tag");
    // Every strategy needs a tag.
    await expect(deliveryService.saveDeliveryStrategy({ name: "Loose", chargeType: "none", chargeValue: 0 })).rejects.toThrow("Pick a tag");
    const at = await deliveryService.saveAddressTag({
      name: "Apartment",
      chargeType: "percent",
      chargeValue: 5,
    });
    await invalidateCatalogSnapshot();

    const snap = await loadCatalogSnapshot();
    const planKey = snap.plans[0].key;
    const mealSizePublicId = snap.mealSizes[0].publicId;

    // 2. Create order with delivery selections
    const { deploymentId, publicId } = await createOrder({
      planKey,
      selections: {
        mealSizeId: mealSizePublicId,
        frequencyKey: "5_day",
        persons: 1,
        mealSlots: ["lunch"],
        includeSaturday: false,
        includeSunday: false,
        durationWeeks: 1,
        startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
        deliveryTagId: spot.id,
        deliveryStrategyIds: [dt.id, call.id],
        addressTagId: at.id,
      },
      contact: {
        fullName: "Test Customer",
        phone: "+16475550222",
        email: "testcustomer@test.invalid",
        addressLine: "100 King St W",
        city: "Toronto",
        postalCode: "M5V 2T6",
      },
    });

    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    expect(order).toBeDefined();

    // The new address typed at checkout keeps the drop-off chosen with it.
    const [addr] = await db.select({ tagId: customerAddresses.deliveryTagId, strategyIds: customerAddresses.deliveryStrategyIds }).from(customerAddresses).where(eq(customerAddresses.id, order.addressId!));
    expect(addr).toEqual({ tagId: spot.internalId, strategyIds: [dt.internalId, call.internalId] });

    const snapshot = order.pricingSnapshot as {
      subtotal: number;
      perTiffinPrice: number;
      tiffinCount: number;
      deliveryCharge?: {
        baseAmount: number;
        totalDeliveryCharge: number;
        deliveryStrategies: { name: string; group: string | null; amount: number }[];
        addressTag?: { name: string; amount: number };
      };
    };

    expect(snapshot.deliveryCharge).toBeDefined();
    expect(snapshot.deliveryCharge?.baseAmount).toBe(2);
    expect(snapshot.deliveryCharge?.deliveryStrategies.map((s) => [s.group, s.name, s.amount])).toEqual([
      ["Apartment", "Doorstep", 1.5],
      ["Apartment", "Call on arrival", 0.5],
    ]);
    expect(snapshot.deliveryCharge?.addressTag?.name).toBe("Apartment");
    expect(Number(order.deliveryCharge)).toBe(snapshot.deliveryCharge?.totalDeliveryCharge);
    expect(order.deliveryStrategyIds).toEqual([dt.internalId, call.internalId]);
    expect(order.deliveryTagId).toBe(spot.internalId);
    expect(order.addressTagId).toBe(at.internalId);
    const expectedDeliveryCharge = snapshot.deliveryCharge!.totalDeliveryCharge;

    // 3. Historical immutability test (Case 7):
    // Now change the delivery charge rules: Base -> $10, Doorstep -> $5
    await deliveryService.updateBaseDeliveryCharge(10);
    await deliveryService.saveDeliveryStrategy({
      id: dt.id,
      name: "Doorstep",
      chargeType: "fixed",
      chargeValue: 5,
      groupId: spot.id,
    });
    await invalidateCatalogSnapshot();

    // Verify the historical order remains untouched!
    const [orderAfter] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    expect(Number(orderAfter.deliveryCharge)).toBe(expectedDeliveryCharge);
    expect(orderAfter.total).toBe(order.total);
    expect((orderAfter.pricingSnapshot as typeof snapshot).deliveryCharge?.totalDeliveryCharge).toBe(expectedDeliveryCharge);
  });

  it("reprice dynamically recalculates when customer changes delivery type or address tag (Case 8)", async () => {
    await deliveryService.updateBaseDeliveryCharge(2);
    const spot = await deliveryService.saveDeliveryStrategyGroup({ name: "Drop-off spot" });
    const dtLobby = await deliveryService.saveDeliveryStrategy({
      name: "Lobby",
      chargeType: "fixed",
      chargeValue: 1,
      groupId: spot.id,
    });
    const atHouse = await deliveryService.saveAddressTag({
      name: "House",
      chargeType: "none",
      chargeValue: 0,
    });
    const atApt = await deliveryService.saveAddressTag({
      name: "Apartment",
      chargeType: "fixed",
      chargeValue: 3,
    });
    await invalidateCatalogSnapshot();

    const snap = await loadCatalogSnapshot();
    const selBase = {
      mealSizeId: snap.mealSizes[0].publicId,
      frequencyKey: "5_day",
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    };

    // Reprice with House + Lobby: Base $2 + Lobby $1 + House $0 = $3 delivery
    const r1 = await reprice({ ...selBase, deliveryStrategyIds: [dtLobby.id], addressTagId: atHouse.id });
    expect(r1.pricing.deliveryCharge?.totalDeliveryCharge).toBe(3);

    // Reprice changed to Apartment + Lobby: Base $2 + Lobby $1 + Apt $3 = $6 delivery
    const r2 = await reprice({ ...selBase, deliveryStrategyIds: [dtLobby.id], addressTagId: atApt.id });
    expect(r2.pricing.deliveryCharge?.totalDeliveryCharge).toBe(6);
    expect(r2.pricing.subtotal).toBe(r1.pricing.subtotal + 3);
  });

  it("a tag still in use is retired, and its strategies leave the catalog", async () => {
    const spot = await deliveryService.saveDeliveryStrategyGroup({ name: "Apartment" });
    const lobby = await deliveryService.saveDeliveryStrategy({ name: "Lobby", chargeType: "none", chargeValue: 0, groupId: spot.id });
    // Same name under another tag is fine; under the same tag it is not.
    const other = await deliveryService.saveDeliveryStrategyGroup({ name: "Office" });
    await deliveryService.saveDeliveryStrategy({ name: "Lobby", chargeType: "none", chargeValue: 0, groupId: other.id });
    await expect(deliveryService.saveDeliveryStrategy({ name: "Lobby", chargeType: "none", chargeValue: 0, groupId: spot.id })).rejects.toThrow("already exists");

    expect(await deliveryService.deleteDeliveryStrategyGroup(spot.id)).toEqual({ success: true, deactivatedInstead: true });
    await invalidateCatalogSnapshot();
    const snap = await loadCatalogSnapshot();
    expect(snap.deliveryCharges?.strategyGroups?.map((g) => g.name)).toEqual(["Office"]);
    expect(snap.deliveryCharges?.deliveryStrategies.some((o) => o.publicId === lobby.id)).toBe(false);

    // Connections are shared: A→B, then C→B puts all three in one set.
    const mk = (name: string) => deliveryService.saveDeliveryStrategy({ name, chargeType: "none", chargeValue: 0, groupId: other.id });
    const [a, b, c] = [await mk("A"), await mk("B"), await mk("C")];
    await deliveryService.connectDeliveryStrategy(a.id, [b.id]);
    let all = await deliveryService.connectDeliveryStrategy(c.id, [a.id, b.id]);
    const setOf = (id: string) => all.find((o) => o.id === id)?.connectionId;
    expect(setOf(a.id)).toBeTruthy();
    expect(new Set([setOf(a.id), setOf(b.id), setOf(c.id)]).size).toBe(1);
    // Unpicking B from C's connections takes B out of the set; A and C stay connected.
    all = await deliveryService.connectDeliveryStrategy(c.id, [a.id]);
    expect(setOf(b.id)).toBeNull();
    expect(setOf(a.id)).toBe(setOf(c.id));
    // Leaving one alone in a set drops the set.
    all = await deliveryService.connectDeliveryStrategy(a.id, []);
    expect([setOf(a.id), setOf(c.id)]).toEqual([null, null]);
    expect(await db.select().from(deliveryStrategyConnections)).toHaveLength(0);
  });
});
