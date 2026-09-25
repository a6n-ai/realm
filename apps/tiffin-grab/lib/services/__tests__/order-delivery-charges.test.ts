import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";
import { db } from "@/db/client";
import {
  addressTags,
  deliveries,
  deliveryChargeConfigs,
  deliveryTypes,
  ledgerEntries,
  orders,
  payments,
  users,
} from "@/db/schema";
import { loadCatalogSnapshot, invalidateCatalogSnapshot } from "@/lib/catalog/load";
import { deliveryChargesService } from "../delivery-charges.service";
import { reprice } from "@/app/(public)/subscribe/actions";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { createOrder } = await import("../orders.service");

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(deliveryTypes);
  await db.delete(addressTags);
  await db.delete(deliveryChargeConfigs);
  await db.delete(users).where(ne(users.isSystem, true));
  await invalidateCatalogSnapshot();
}

describe("Order Delivery Charges (Integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("persists deliveryCharge, deliveryTypeId, addressTagId and immutable pricingSnapshot", async () => {
    // 1. Configure delivery rules
    await deliveryChargesService.updateBaseDeliveryCharge(2); // Base = $2.00
    const dt = await deliveryChargesService.saveDeliveryType({
      name: "Doorstep",
      chargeType: "fixed",
      chargeValue: 1.5,
    });
    const at = await deliveryChargesService.saveAddressTag({
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
        deliveryTypeId: dt.id,
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

    const snapshot = order.pricingSnapshot as {
      subtotal: number;
      perTiffinPrice: number;
      tiffinCount: number;
      deliveryCharge?: {
        baseAmount: number;
        totalDeliveryCharge: number;
        deliveryType?: { name: string; amount: number };
        addressTag?: { name: string; amount: number };
      };
    };

    expect(snapshot.deliveryCharge).toBeDefined();
    expect(snapshot.deliveryCharge?.baseAmount).toBe(2);
    expect(snapshot.deliveryCharge?.deliveryType?.name).toBe("Doorstep");
    expect(snapshot.deliveryCharge?.deliveryType?.amount).toBe(1.5);
    expect(snapshot.deliveryCharge?.addressTag?.name).toBe("Apartment");
    expect(Number(order.deliveryCharge)).toBe(snapshot.deliveryCharge?.totalDeliveryCharge);
    expect(order.deliveryTypeId).toBe(dt.internalId);
    expect(order.addressTagId).toBe(at.internalId);
    const expectedDeliveryCharge = snapshot.deliveryCharge!.totalDeliveryCharge;

    // 3. Historical immutability test (Case 7):
    // Now change the delivery charge rules: Base -> $10, Doorstep -> $5
    await deliveryChargesService.updateBaseDeliveryCharge(10);
    await deliveryChargesService.saveDeliveryType({
      id: dt.id,
      name: "Doorstep",
      chargeType: "fixed",
      chargeValue: 5,
    });
    await invalidateCatalogSnapshot();

    // Verify the historical order remains untouched!
    const [orderAfter] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    expect(Number(orderAfter.deliveryCharge)).toBe(expectedDeliveryCharge);
    expect(orderAfter.total).toBe(order.total);
    expect((orderAfter.pricingSnapshot as typeof snapshot).deliveryCharge?.totalDeliveryCharge).toBe(expectedDeliveryCharge);
  });

  it("reprice dynamically recalculates when customer changes delivery type or address tag (Case 8)", async () => {
    await deliveryChargesService.updateBaseDeliveryCharge(2);
    const dtLobby = await deliveryChargesService.saveDeliveryType({
      name: "Lobby",
      chargeType: "fixed",
      chargeValue: 1,
    });
    const atHouse = await deliveryChargesService.saveAddressTag({
      name: "House",
      chargeType: "none",
      chargeValue: 0,
    });
    const atApt = await deliveryChargesService.saveAddressTag({
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
    const r1 = await reprice({ ...selBase, deliveryTypeId: dtLobby.id, addressTagId: atHouse.id });
    expect(r1.pricing.deliveryCharge?.totalDeliveryCharge).toBe(3);

    // Reprice changed to Apartment + Lobby: Base $2 + Lobby $1 + Apt $3 = $6 delivery
    const r2 = await reprice({ ...selBase, deliveryTypeId: dtLobby.id, addressTagId: atApt.id });
    expect(r2.pricing.deliveryCharge?.totalDeliveryCharge).toBe(6);
    expect(r2.pricing.subtotal).toBe(r1.pricing.subtotal + 3);
  });
});
