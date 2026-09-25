import { describe, expect, it } from "vitest";
import { calculateDeliveryCharge } from "../delivery-charges";
import { priceSubscription } from "../engine";
import { buildPricingCatalog } from "../build-catalog";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { PricingCatalog, PricingSelections } from "../types";
import type { PricingTier } from "../tiers";

const TIERS: PricingTier[] = [
  { minQty: 1, maxQty: 11, upliftPct: 0 },
  { minQty: 12, maxQty: null, upliftPct: 0 },
];

const catalog = (basePrice = 10, extra: Partial<PricingCatalog> = {}): PricingCatalog => ({
  mealSize: { id: "m1", basePrice },
  frequency: { key: "5_day", daysPerWeek: 5 },
  tiers: TIERS,
  addons: [],
  discounts: [],
  maxDiscountPct: 25,
  ...extra,
});

const sel = (over: Partial<PricingSelections> = {}): PricingSelections => ({
  mealSizeId: "m1",
  frequencyKey: "5_day",
  persons: 1,
  mealSlots: ["lunch"],
  includeSaturday: false,
  includeSunday: false,
  durationWeeks: 2, // 5 days * 2 weeks = 10 tiffins * $10 = $100 plan price
  startDate: "2026-06-23",
  ...over,
});

describe("Delivery Charges - Test Scenarios from Spec", () => {
  // Scenario 1: Base = $0, Type = $0, Tag = $0 -> Delivery Charge = $0
  it("Scenario 1: Base $0, Type $0, Tag $0 -> Total Delivery = $0", () => {
    const calc = calculateDeliveryCharge({
      baseCharge: 0,
      deliveryType: { name: "Standard", chargeType: "fixed", chargeValue: 0 },
      addressTag: { name: "Home", chargeType: "none", chargeValue: 0 },
      planPrice: 100,
    });
    expect(calc.totalDeliveryCharge).toBe(0);
    expect(calc.baseAmount).toBe(0);
    expect(calc.lines).toHaveLength(0);

    const r = priceSubscription(sel(), catalog(10, {
      deliveryChargeConfig: {
        baseCharge: 0,
        deliveryType: { name: "Standard", chargeType: "fixed", chargeValue: 0 },
        addressTag: { name: "Home", chargeType: "none", chargeValue: 0 },
      },
    }));
    expect(r.subtotal).toBe(100);
    expect(r.total).toBe(100);
    expect(r.deliveryCharge?.totalDeliveryCharge).toBe(0);
  });

  // Scenario 2: Base = $2, Type = $0, Tag = $0 -> Delivery Charge = $2
  it("Scenario 2: Base $2, Type $0, Tag $0 -> Total Delivery = $2", () => {
    const calc = calculateDeliveryCharge({
      baseCharge: 2,
      deliveryType: { name: "Standard", chargeType: "fixed", chargeValue: 0 },
      addressTag: { name: "Home", chargeType: "none", chargeValue: 0 },
      planPrice: 100,
    });
    expect(calc.totalDeliveryCharge).toBe(2);
    expect(calc.baseAmount).toBe(2);
    expect(calc.deliveryType?.amount).toBe(0);
    expect(calc.addressTag?.amount).toBe(0);
    expect(calc.lines).toEqual([
      { label: "Base delivery charge", amount: 2 },
    ]);

    const r = priceSubscription(sel(), catalog(10, {
      deliveryChargeConfig: {
        baseCharge: 2,
        deliveryType: { name: "Standard", chargeType: "fixed", chargeValue: 0 },
        addressTag: { name: "Home", chargeType: "none", chargeValue: 0 },
      },
    }));
    expect(r.subtotal).toBe(102);
    expect(r.total).toBe(102);
    expect(r.deliveryCharge?.totalDeliveryCharge).toBe(2);
  });

  // Scenario 3: Base = $2, Type = $1, Tag = $0 -> Delivery Charge = $3
  it("Scenario 3: Base $2, Type $1, Tag $0 -> Total Delivery = $3", () => {
    const calc = calculateDeliveryCharge({
      baseCharge: 2,
      deliveryType: { name: "Doorstep", chargeType: "fixed", chargeValue: 1 },
      addressTag: { name: "Home", chargeType: "none", chargeValue: 0 },
      planPrice: 100,
    });
    expect(calc.totalDeliveryCharge).toBe(3);
    expect(calc.baseAmount).toBe(2);
    expect(calc.deliveryType?.amount).toBe(1);
    expect(calc.lines).toEqual([
      { label: "Base delivery charge", amount: 2 },
      { label: "Delivery type: Doorstep", amount: 1 },
    ]);

    const r = priceSubscription(sel(), catalog(10, {
      deliveryChargeConfig: {
        baseCharge: 2,
        deliveryType: { name: "Doorstep", chargeType: "fixed", chargeValue: 1 },
        addressTag: { name: "Home", chargeType: "none", chargeValue: 0 },
      },
    }));
    expect(r.subtotal).toBe(103);
    expect(r.total).toBe(103);
    expect(r.deliveryCharge?.totalDeliveryCharge).toBe(3);
  });

  // Scenario 4: Base = $2, Type = $0, Tag = $1 -> Delivery Charge = $3
  it("Scenario 4: Base $2, Type $0, Tag $1 -> Total Delivery = $3", () => {
    const calc = calculateDeliveryCharge({
      baseCharge: 2,
      deliveryType: { name: "Standard", chargeType: "none", chargeValue: 0 },
      addressTag: { name: "Apartment", chargeType: "fixed", chargeValue: 1 },
      planPrice: 100,
    });
    expect(calc.totalDeliveryCharge).toBe(3);
    expect(calc.baseAmount).toBe(2);
    expect(calc.addressTag?.amount).toBe(1);
    expect(calc.lines).toEqual([
      { label: "Base delivery charge", amount: 2 },
      { label: "Address tag: Apartment", amount: 1 },
    ]);

    const r = priceSubscription(sel(), catalog(10, {
      deliveryChargeConfig: {
        baseCharge: 2,
        deliveryType: { name: "Standard", chargeType: "none", chargeValue: 0 },
        addressTag: { name: "Apartment", chargeType: "fixed", chargeValue: 1 },
      },
    }));
    expect(r.subtotal).toBe(103);
    expect(r.total).toBe(103);
    expect(r.deliveryCharge?.totalDeliveryCharge).toBe(3);
  });

  // Scenario 5: Base = $2, Type = $1, Tag = 5%, Plan = $100 -> Delivery Charge = $8 ($2 + $1 + $5)
  it("Scenario 5: Base $2, Type $1, Tag 5% on $100 plan -> Total Delivery = $8", () => {
    const calc = calculateDeliveryCharge({
      baseCharge: 2,
      deliveryType: { name: "Lobby", chargeType: "fixed", chargeValue: 1 },
      addressTag: { name: "Apartment", chargeType: "percent", chargeValue: 5 },
      planPrice: 100,
    });
    expect(calc.baseAmount).toBe(2);
    expect(calc.deliveryType?.amount).toBe(1);
    expect(calc.addressTag?.amount).toBe(5); // 5% of $100 = $5
    expect(calc.totalDeliveryCharge).toBe(8);
    expect(calc.lines).toEqual([
      { label: "Base delivery charge", amount: 2 },
      { label: "Delivery type: Lobby", amount: 1 },
      { label: "Address tag: Apartment (5%)", amount: 5 },
    ]);

    const r = priceSubscription(sel(), catalog(10, {
      deliveryChargeConfig: {
        baseCharge: 2,
        deliveryType: { name: "Lobby", chargeType: "fixed", chargeValue: 1 },
        addressTag: { name: "Apartment", chargeType: "percent", chargeValue: 5 },
      },
    }));
    // Plan = $100, Delivery = $8 -> Subtotal = $108
    expect(r.subtotal).toBe(108);
    expect(r.total).toBe(108);
    expect(r.deliveryCharge?.totalDeliveryCharge).toBe(8);
  });

  // Scenario 6: Inactive delivery type/tag cannot be selected for new pricing
  it("Scenario 6: buildPricingCatalog rejects inactive delivery type or address tag", () => {
    const mockSnapshot: CatalogSnapshot = {
      plans: [{ id: 1n, publicId: "plan_1", key: "regular", name: "Regular", description: null, planType: "tiffin", offeredSlots: ["lunch"], allowedStartDays: [] }],
      mealSizes: [{
        id: 1n, publicId: "m1", key: "standard", name: "Standard", description: null, planId: 1n, planKey: "regular",
        tier: "medium", components: [], items: [], kcalMin: 500, kcalMax: 700, proteinG: null, carbsG: null, fatG: null,
        basePrice: 10, discountType: "none", discountValue: 0, trial: false,
      }],
      frequencies: [{ id: 1n, publicId: "freq_1", key: "5_day", name: "5 Day", daysPerWeek: 5, courierDiscountPct: 0, weekdays: null }],
      durations: [{ id: 1n, publicId: "dur_2", weeks: 2, discountPct: 0 }],
      zones: [{ id: 1n, publicId: "z1", name: "Downtown", postalPrefixes: ["M5V"], slotWindow: "11am-1pm", active: true }],
      tiers: TIERS,
      deliveryCharges: {
        baseCharge: 2,
        deliveryTypes: [
          { id: 1n, publicId: "dt_active", name: "Lobby", description: null, chargeType: "fixed", chargeValue: 1, active: true, sortOrder: 0 },
          { id: 2n, publicId: "dt_inactive", name: "Old Type", description: null, chargeType: "fixed", chargeValue: 5, active: false, sortOrder: 1 },
        ],
        addressTags: [
          { id: 1n, publicId: "at_active", name: "House", description: null, chargeType: "none", chargeValue: 0, active: true, sortOrder: 0 },
          { id: 2n, publicId: "at_inactive", name: "Old Tag", description: null, chargeType: "percent", chargeValue: 10, active: false, sortOrder: 1 },
        ],
      },
    };

    // Valid active selections succeed
    const validCat = buildPricingCatalog(mockSnapshot, sel({
      deliveryTypeId: "dt_active",
      addressTagId: "at_active",
    }));
    expect(validCat.deliveryChargeConfig?.baseCharge).toBe(2);
    expect(validCat.deliveryChargeConfig?.deliveryType?.name).toBe("Lobby");
    expect(validCat.deliveryChargeConfig?.addressTag?.name).toBe("House");

    // Inactive delivery type throws ValidationError
    expect(() => buildPricingCatalog(mockSnapshot, sel({
      deliveryTypeId: "dt_inactive",
    }))).toThrow("Invalid delivery type");

    // Inactive address tag throws ValidationError
    expect(() => buildPricingCatalog(mockSnapshot, sel({
      addressTagId: "at_inactive",
    }))).toThrow("Invalid address tag");

    // Non-existent IDs throw ValidationError
    expect(() => buildPricingCatalog(mockSnapshot, sel({
      deliveryTypeId: "non_existent",
    }))).toThrow("Invalid delivery type");
  });

  // Scenario 7: Order Total includes Plan Price + Delivery Charge + Addons - Discounts + Taxes
  it("Scenario 7: Full order calculation with plan, addons, delivery, discount, and tax", () => {
    // Plan: 10 tiffins @ $10 = $100
    // Addon: 1 addon @ $10/wk * 2 wks = $20
    // Delivery: Base $2 + Type $1 + Tag 5% ($5) = $8
    // Subtotal: 100 + 20 + 8 = $128
    // Cadence discount: 10% on tiffins ($100 * 10% = $10)
    // Taxable base: $128 - $10 = $118
    // Taxes: 13% HST on $118 = $15.34
    // Total: $118 + $15.34 = $133.34
    const r = priceSubscription(
      sel(),
      catalog(10, {
        addons: [{ key: "extra_curry", name: "Extra Curry", pricePerWeek: 10, qty: 1 }],
        discounts: [{ key: "disc_10", label: "Delivery discount (10%)", percent: 10 }],
        deliveryChargeConfig: {
          baseCharge: 2,
          deliveryType: { name: "Lobby", chargeType: "fixed", chargeValue: 1 },
          addressTag: { name: "Apartment", chargeType: "percent", chargeValue: 5 },
        },
      }),
      [],
      [{ name: "HST", ratePct: 13 }],
    );

    expect(r.tiffinCount).toBe(10);
    expect(r.subtotal).toBe(128);
    expect(r.adjustments).toEqual([
      { label: "Delivery discount (10%)", amount: 10, discountKey: "disc_10" },
    ]);
    expect(r.taxLines).toEqual([
      { name: "HST", ratePct: 13, amount: 15.34 },
    ]);
    expect(r.taxTotal).toBe(15.34);
    expect(r.total).toBe(133.34);
    expect(r.deliveryCharge?.totalDeliveryCharge).toBe(8);
  });

  // Edge cases
  it("Edge cases: clamp negatives to 0, handle undefined deliveryType/addressTag", () => {
    const calc = calculateDeliveryCharge({
      baseCharge: -5, // clamped to 0
      deliveryType: { name: "Special", chargeType: "fixed", chargeValue: -10 }, // clamped to 0
      addressTag: { name: "Special Tag", chargeType: "percent", chargeValue: -5 }, // clamped to 0
      planPrice: -100, // clamped to 0
    });
    expect(calc.baseAmount).toBe(0);
    expect(calc.deliveryType?.amount).toBe(0);
    expect(calc.addressTag?.amount).toBe(0);
    expect(calc.totalDeliveryCharge).toBe(0);

    const calcNull = calculateDeliveryCharge({
      baseCharge: 0,
      deliveryType: null,
      addressTag: null,
      planPrice: 100,
    });
    expect(calcNull.totalDeliveryCharge).toBe(0);
    expect(calcNull.deliveryType).toBeNull();
    expect(calcNull.addressTag).toBeNull();
  });
});
