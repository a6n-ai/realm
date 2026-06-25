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

describe("rowToForm", () => {
  it("keeps arrays as arrays and stringifies scalars", () => {
    const out = rowToForm(RESOURCES.plans, { key: "x", name: "X", planType: "tiffin", offeredSlots: ["bf", "dn"], allowedStartDays: ["mon"], description: null });
    expect(out.offeredSlots).toEqual(["bf", "dn"]);
    expect(out.description).toBe("");
  });
});
