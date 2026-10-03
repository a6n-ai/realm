import { describe, expect, it } from "vitest";
import { calculateDeliveryCharge } from "@foundry/delivery";
import { priceSubscription } from "../engine";
import { buildPricingCatalog, planDeliveryCount } from "../build-catalog";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { PricingCatalog, PricingSelections } from "../types";

const catalog = (basePrice = 10, extra: Partial<PricingCatalog> = {}): PricingCatalog => ({
  mealSize: { id: "m1", basePrice },
  frequency: { key: "5_day", daysPerWeek: 5 },
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
      deliveryStrategies: [{ name: "Standard", chargeType: "fixed", chargeValue: 0 }],
      addressTag: { name: "Home", chargeType: "none", chargeValue: 0 },
      planPrice: 100,
    });
    expect(calc.totalDeliveryCharge).toBe(0);
    expect(calc.baseAmount).toBe(0);
    expect(calc.lines).toHaveLength(0);

    const r = priceSubscription(sel(), catalog(10, {
      deliveryChargeConfig: {
        baseCharge: 0,
        deliveryStrategies: [{ name: "Standard", chargeType: "fixed", chargeValue: 0 }],
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
      deliveryStrategies: [{ name: "Standard", chargeType: "fixed", chargeValue: 0 }],
      addressTag: { name: "Home", chargeType: "none", chargeValue: 0 },
      planPrice: 100,
    });
    expect(calc.totalDeliveryCharge).toBe(2);
    expect(calc.baseAmount).toBe(2);
    expect(calc.deliveryStrategies[0]?.amount).toBe(0);
    expect(calc.addressTag?.amount).toBe(0);
    expect(calc.lines).toEqual([
      { label: "Base delivery charge", amount: 2 },
    ]);

    const r = priceSubscription(sel(), catalog(10, {
      deliveryChargeConfig: {
        baseCharge: 2,
        deliveryStrategies: [{ name: "Standard", chargeType: "fixed", chargeValue: 0 }],
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
      deliveryStrategies: [{ name: "Doorstep", chargeType: "fixed", chargeValue: 1 }],
      addressTag: { name: "Home", chargeType: "none", chargeValue: 0 },
      planPrice: 100,
    });
    expect(calc.totalDeliveryCharge).toBe(3);
    expect(calc.baseAmount).toBe(2);
    expect(calc.deliveryStrategies[0]?.amount).toBe(1);
    expect(calc.lines).toEqual([
      { label: "Base delivery charge", amount: 2 },
      { label: "Delivery strategy: Doorstep", amount: 1 },
    ]);

    const r = priceSubscription(sel(), catalog(10, {
      deliveryChargeConfig: {
        baseCharge: 2,
        deliveryStrategies: [{ name: "Doorstep", chargeType: "fixed", chargeValue: 1 }],
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
      deliveryStrategies: [{ name: "Standard", chargeType: "none", chargeValue: 0 }],
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
        deliveryStrategies: [{ name: "Standard", chargeType: "none", chargeValue: 0 }],
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
      deliveryStrategies: [{ name: "Lobby", chargeType: "fixed", chargeValue: 1 }],
      addressTag: { name: "Apartment", chargeType: "percent", chargeValue: 5 },
      planPrice: 100,
    });
    expect(calc.baseAmount).toBe(2);
    expect(calc.deliveryStrategies[0]?.amount).toBe(1);
    expect(calc.addressTag?.amount).toBe(5); // 5% of $100 = $5
    expect(calc.totalDeliveryCharge).toBe(8);
    expect(calc.lines).toEqual([
      { label: "Base delivery charge", amount: 2 },
      { label: "Delivery strategy: Lobby", amount: 1 },
      { label: "Address tag: Apartment (5%)", amount: 5 },
    ]);

    const r = priceSubscription(sel(), catalog(10, {
      deliveryChargeConfig: {
        baseCharge: 2,
        deliveryStrategies: [{ name: "Lobby", chargeType: "fixed", chargeValue: 1 }],
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
        basePrice: 10, discountType: "none", discountValue: 0, trial: false, custom: false, priceable: true, servesWeekends: true,
      }],
      frequencies: [{ id: 1n, publicId: "freq_1", key: "5_day", name: "5 Day", daysPerWeek: 5, weekdays: null }],
      durations: [{ id: 1n, publicId: "dur_2", weeks: 2 }],
      zones: [{ id: 1n, publicId: "z1", name: "Downtown", radiusKm: null, postalPrefixes: ["M5V"], slotWindow: "11am-1pm", active: true }],
      deliveryCharges: {
        baseCharge: 2,
        strategyGroups: [
          { publicId: "grp_apt", name: "Apartment", description: null },
          { publicId: "grp_home", name: "Home", description: null },
        ],
        strategyConnections: [{ publicId: "set_spot", name: "Drop-off", groupId: "grp_apt" }],
        deliveryStrategies: [
          { id: 1n, publicId: "dt_active", name: "Lobby", description: null, chargeType: "fixed", chargeValue: 1, active: true, sortOrder: 0, groupPublicId: "grp_apt", connectionPublicId: "set_spot" },
          { id: 2n, publicId: "dt_inactive", name: "Old Type", description: null, chargeType: "fixed", chargeValue: 5, active: false, sortOrder: 1, groupPublicId: "grp_apt", connectionPublicId: null },
          { id: 3n, publicId: "dt_door", name: "Leave at door", description: null, chargeType: "fixed", chargeValue: 2, active: true, sortOrder: 2, groupPublicId: "grp_apt", connectionPublicId: "set_spot" },
          { id: 6n, publicId: "dt_buzz", name: "Buzz on arrival", description: null, chargeType: "fixed", chargeValue: 0.5, active: true, sortOrder: 3, groupPublicId: "grp_apt", connectionPublicId: null, chargeBasis: "per_delivery" },
          { id: 4n, publicId: "dt_call", name: "Call on arrival", description: null, chargeType: "percent", chargeValue: 1, active: true, sortOrder: 0, groupPublicId: "grp_apt", connectionPublicId: null },
          { id: 5n, publicId: "dt_porch", name: "Porch", description: null, chargeType: "none", chargeValue: 0, active: true, sortOrder: 0, groupPublicId: "grp_home", connectionPublicId: null },
        ],
        addressTags: [
          { id: 1n, publicId: "at_active", name: "House", description: null, chargeType: "none", chargeValue: 0, active: true, sortOrder: 0 },
          { id: 2n, publicId: "at_inactive", name: "Old Tag", description: null, chargeType: "percent", chargeValue: 10, active: false, sortOrder: 1 },
        ],
      },
    };

    // A set pick plus a free strategy, each labelled by the place type
    const validCat = buildPricingCatalog(mockSnapshot, sel({
      deliveryTagId: "grp_apt",
      deliveryStrategyIds: ["dt_active", "dt_call"],
      addressTagId: "at_active",
    }));
    expect(validCat.deliveryChargeConfig?.baseCharge).toBe(2);
    expect(validCat.deliveryChargeConfig?.deliveryStrategies?.map((s) => [s.group, s.name])).toEqual([
      ["Apartment", "Lobby"],
      ["Apartment", "Call on arrival"],
    ]);
    expect(validCat.deliveryChargeConfig?.addressTag?.name).toBe("House");
    // $100 plan: base 2 + Lobby 1 + 1% call = $4
    expect(priceSubscription(sel(), validCat).deliveryCharge?.lines.map((l) => l.label)).toEqual([
      "Base delivery charge",
      "Apartment: Lobby",
      "Apartment: Call on arrival (1%)",
    ]);
    // Connected strategies can each carry their own price
    expect(priceSubscription(sel(), buildPricingCatalog(mockSnapshot, sel({ deliveryStrategyIds: ["dt_door"] }))).deliveryCharge?.totalDeliveryCharge).toBe(4);
    // Everything is optional: a place type alone, or nothing at all
    expect(buildPricingCatalog(mockSnapshot, sel({ deliveryTagId: "grp_home" })).deliveryChargeConfig?.deliveryStrategies).toEqual([]);
    expect(buildPricingCatalog(mockSnapshot, sel()).deliveryChargeConfig?.deliveryStrategies).toEqual([]);

    // Per delivery: 5 deliveries a week × 2 weeks = 10 × $0.50 = $5, on top of base $2
    const perDelivery = priceSubscription(sel(), buildPricingCatalog(mockSnapshot, sel({ deliveryStrategyIds: ["dt_buzz"] })));
    expect(perDelivery.deliveryCharge?.totalDeliveryCharge).toBe(7);
    expect(perDelivery.deliveryCharge?.lines.map((l) => l.label)).toContain("Apartment: Buzz on arrival (10 × $0.50)");

    // Inactive or unknown strategies and place types are refused
    expect(() => buildPricingCatalog(mockSnapshot, sel({ deliveryStrategyIds: ["dt_inactive"] }))).toThrow("isn't available");
    expect(() => buildPricingCatalog(mockSnapshot, sel({ deliveryStrategyIds: ["non_existent"] }))).toThrow("isn't available");
    expect(() => buildPricingCatalog(mockSnapshot, sel({ deliveryTagId: "grp_gone" }))).toThrow("isn't available");
    // Two from one connected set would stack alternatives
    expect(() => buildPricingCatalog(mockSnapshot, sel({ deliveryStrategyIds: ["dt_active", "dt_door"] }))).toThrow("Pick only one of Drop-off");
    // Strategies must belong to the chosen place type
    expect(() => buildPricingCatalog(mockSnapshot, sel({ deliveryTagId: "grp_home", deliveryStrategyIds: ["dt_call"] }))).toThrow("chosen place");
    expect(() => buildPricingCatalog(mockSnapshot, sel({ deliveryStrategyIds: ["dt_call", "dt_porch"] }))).toThrow("chosen place");
    // Not an array of strings (server-action input)
    expect(() => buildPricingCatalog(mockSnapshot, sel({ deliveryStrategyIds: "dt_active" as unknown as string[] }))).toThrow("Invalid delivery options");

    // Inactive address tag throws ValidationError
    expect(() => buildPricingCatalog(mockSnapshot, sel({
      addressTagId: "at_inactive",
    }))).toThrow("Invalid address tag");
  });

  // Scenario 7: Order Total includes Plan Price + Delivery Charge + Addons - Discounts + Taxes
  it("Scenario 7: Full order calculation with plan, addons, delivery, discount, and tax", () => {
    // Plan: 10 tiffins @ $10 = $100
    // Addon: 1 addon @ $2/tiffin * 10 tiffins = $20
    // Delivery: Base $2 + Type $1 + Tag 5% ($5) = $8
    // Subtotal: 100 + 20 + 8 = $128
    // Cadence discount: 10% on tiffins ($100 * 10% = $10)
    // Taxable base: $128 - $10 = $118
    // Taxes: 13% HST on $118 = $15.34
    // Total: $118 + $15.34 = $133.34
    const r = priceSubscription(
      sel(),
      catalog(10, {
        addons: [{ key: "extra_curry", name: "Extra Curry", category: "sabzi", tuAmount: 1, pricePerTiffin: 2, qty: 1 }],
        discounts: [{ key: "disc_10", label: "Delivery discount (10%)", percent: 10 }],
        deliveryChargeConfig: {
          baseCharge: 2,
          deliveryStrategies: [{ name: "Lobby", chargeType: "fixed", chargeValue: 1 }],
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
  it("Edge cases: clamp negatives to 0, handle undefined deliveryStrategy/addressTag", () => {
    const calc = calculateDeliveryCharge({
      baseCharge: -5, // clamped to 0
      deliveryStrategies: [{ name: "Special", chargeType: "fixed", chargeValue: -10 }], // clamped to 0
      addressTag: { name: "Special Tag", chargeType: "percent", chargeValue: -5 }, // clamped to 0
      planPrice: -100, // clamped to 0
    });
    expect(calc.baseAmount).toBe(0);
    expect(calc.deliveryStrategies[0]?.amount).toBe(0);
    expect(calc.addressTag?.amount).toBe(0);
    expect(calc.totalDeliveryCharge).toBe(0);

    const calcNull = calculateDeliveryCharge({
      baseCharge: 0,
      deliveryStrategies: null,
      addressTag: null,
      planPrice: 100,
    });
    expect(calcNull.totalDeliveryCharge).toBe(0);
    expect(calcNull.deliveryStrategies).toEqual([]);
    expect(calcNull.addressTag).toBeNull();
  });
});

describe("planDeliveryCount", () => {
  const five = { key: "5_day", weekdays: null };
  const base = { includeSaturday: false, includeSunday: false, durationWeeks: 4 };
  it("counts delivery trips, not eating days", () => {
    expect(planDeliveryCount(five, base)).toBe(20);
    // Sat + Sun ride Friday's trip: still 5 trips a week.
    expect(planDeliveryCount(five, { ...base, eatingDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] })).toBe(20);
    // Mon, Wed, Fri eating on a 5-day plan: only 3 trips a week.
    expect(planDeliveryCount(five, { ...base, eatingDays: ["mon", "wed", "fri"] })).toBe(12);
    expect(planDeliveryCount({ key: "mwf", weekdays: null }, base)).toBe(12);
  });
});
