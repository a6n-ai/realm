import { describe, expect, it } from "vitest";
import { RESOURCES, slug, rowToForm } from "../resource-config";

describe("slug", () => {
  it("lowercases, hyphenates, strips junk", () => {
    expect(slug("Tiffin Standard")).toBe("tiffin-standard");
    expect(slug("  Healthy   Pro!! ")).toBe("healthy-pro");
    expect(slug("A/B & C")).toBe("a-b-c");
  });
});

describe("plans schema", () => {
  const s = RESOURCES.plans.schema;
  it("accepts a valid plan", () => {
    expect(() => s.parse({ key: "tiffin-standard", name: "Tiffin Standard", planType: "tiffin", offeredSlots: ["bf"], allowedStartDays: ["mon"] })).not.toThrow();
  });
  it("rejects a bad planType enum", () => {
    expect(() => s.parse({ key: "x", name: "X", planType: "deluxe", offeredSlots: [], allowedStartDays: [] })).toThrow();
  });
  it("rejects an invalid key slug", () => {
    expect(() => s.parse({ key: "Tiffin Standard", name: "X", planType: "tiffin", offeredSlots: [], allowedStartDays: [] })).toThrow();
  });
});

describe("delivery-frequencies schema surfaces courierDiscountPct", () => {
  it("coerces numbers and accepts courierDiscountPct", () => {
    const out = RESOURCES["delivery-frequencies"].schema.parse({ key: "weekly", name: "Weekly", daysPerWeek: "5", courierDiscountPct: "10" });
    expect(out.daysPerWeek).toBe(5);
    expect(out.courierDiscountPct).toBe(10);
  });
});

describe("duration-packages schema surfaces discountPct", () => {
  it("accepts weeks + discountPct, no key", () => {
    expect(RESOURCES["duration-packages"].keyed).toBe(false);
    const out = RESOURCES["duration-packages"].schema.parse({ weeks: "4", discountPct: "5" });
    expect(out.weeks).toBe(4);
    expect(out.discountPct).toBe(5);
  });
});

describe("addons resource exists", () => {
  it("is registered and keyed", () => {
    expect(RESOURCES.addons).toBeDefined();
    expect(RESOURCES.addons.keyed).toBe(true);
    expect(() => RESOURCES.addons.schema.parse({ key: "extra-roti", name: "Extra Roti", pricePerWeek: "12.50" })).not.toThrow();
  });
});

describe("blank numeric fields (form feeds \"\")", () => {
  it("pricing-tiers: blank maxQty becomes null, not 0 or a throw (unbounded top band)", () => {
    const out = RESOURCES["pricing-tiers"].schema.parse({ minQty: "0", maxQty: "", upliftPct: "2.5" });
    expect(out.maxQty).toBeNull();
    expect(out.minQty).toBe(0);
    expect(out.upliftPct).toBe(2.5);
  });

  it("pricing-tiers: re-saving an unbounded tier via partial keeps maxQty null", () => {
    const out = RESOURCES["pricing-tiers"].schema.partial().parse({ maxQty: "" });
    expect(out.maxQty).toBeNull();
  });

  it("pricing-tiers: maxQty of 0 is still rejected", () => {
    expect(() => RESOURCES["pricing-tiers"].schema.parse({ minQty: "0", maxQty: "0", upliftPct: "1" })).toThrow();
  });

  it("meal-sizes: blank macros round-trip to null instead of 0", () => {
    const out = RESOURCES["meal-sizes"].schema.parse({
      key: "x", name: "X", tier: "budget", diet: "veg", components: [],
      kcalMin: "300", kcalMax: "500", proteinG: "", carbsG: "", fatG: "", basePrice: "10",
    });
    expect(out.proteinG).toBeNull();
    expect(out.carbsG).toBeNull();
    expect(out.fatG).toBeNull();
  });

  it("required numeric blank is rejected rather than silently coerced to 0", () => {
    expect(() => RESOURCES["pricing-tiers"].schema.parse({ minQty: "", maxQty: "", upliftPct: "1" })).toThrow();
  });

  it("blank field with a default falls back to the default", () => {
    const out = RESOURCES["delivery-frequencies"].schema.parse({ key: "weekly", name: "Weekly", daysPerWeek: "5", courierDiscountPct: "" });
    expect(out.courierDiscountPct).toBe(0);
  });
});

describe("rowToForm", () => {
  it("keeps arrays as arrays and stringifies scalars", () => {
    const out = rowToForm(RESOURCES.plans, { key: "x", name: "X", planType: "tiffin", offeredSlots: ["bf", "dn"], allowedStartDays: ["mon"], description: null });
    expect(out.offeredSlots).toEqual(["bf", "dn"]);
    expect(out.description).toBe("");
  });
});
