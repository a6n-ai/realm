import { describe, expect, it } from "vitest";
import { resolveDiscounts, type DiscountSource } from "../discounts";

function row(over: Partial<DiscountSource> & { publicId: string; name: string }): DiscountSource {
  return {
    amount: null,
    percentage: null,
    active: true,
    publicOffer: false,
    couponCode: null,
    ...over,
  };
}

const ROWS: DiscountSource[] = [
  row({ publicId: "dsc_student", name: "Student 10%", percentage: "10", publicOffer: true }),
  row({ publicId: "dsc_combo", name: "Combo deal", amount: "-3.00", publicOffer: true }),
  row({ publicId: "dsc_staff", name: "Staff comp", percentage: "100" }),
  row({ publicId: "dsc_summer", name: "Summer code", percentage: "15", couponCode: "summer15" }),
  row({ publicId: "dsc_dead", name: "Expired code", percentage: "50", couponCode: "OLD", active: false }),
];

const none = { offerPublicIds: [] };

describe("resolveDiscounts", () => {
  it("applies nothing when nothing is asked for", () => {
    expect(resolveDiscounts(ROWS, none, 40)).toEqual({ applied: [], total: 0, invalidCode: false });
  });

  it("takes Clover's negative amounts as positive money off", () => {
    const r = resolveDiscounts(ROWS, { offerPublicIds: ["dsc_combo"] }, 40);
    expect(r.total).toBe(3);
    expect(r.applied[0]?.amount).toBe(3);
  });

  it("refuses a discount the merchant never published, even by exact id", () => {
    const r = resolveDiscounts(ROWS, { offerPublicIds: ["dsc_staff"] }, 40);
    expect(r.applied).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("matches coupon codes case-insensitively", () => {
    const r = resolveDiscounts(ROWS, { ...none, code: " SuMmEr15 " }, 40);
    expect(r.invalidCode).toBe(false);
    expect(r.total).toBe(6);
    expect(r.applied[0]?.code).toBe("SUMMER15");
  });

  it("reports an unknown or deactivated code without failing the cart", () => {
    expect(resolveDiscounts(ROWS, { ...none, code: "NOPE" }, 40).invalidCode).toBe(true);
    // Deactivated in Clover, so the code dies on the next sync.
    const dead = resolveDiscounts(ROWS, { ...none, code: "OLD" }, 40);
    expect(dead.invalidCode).toBe(true);
    expect(dead.total).toBe(0);
  });

  it("stacks an offer with a coupon", () => {
    const r = resolveDiscounts(ROWS, { offerPublicIds: ["dsc_combo"], code: "SUMMER15" }, 40);
    expect(r.applied).toHaveLength(2);
    expect(r.total).toBe(9); // $3 + 15% of $40
  });

  it("never counts the same discount twice when picked and coded", () => {
    const rows = [row({ publicId: "dsc_x", name: "Both", percentage: "10", publicOffer: true, couponCode: "X10" })];
    const r = resolveDiscounts(rows, { offerPublicIds: ["dsc_x"], code: "X10" }, 40);
    expect(r.applied).toHaveLength(1);
    expect(r.total).toBe(4);
  });

  it("caps the stack at the subtotal so an order can never go negative", () => {
    const rows = [
      row({ publicId: "a", name: "A", amount: "30", publicOffer: true }),
      row({ publicId: "b", name: "B", amount: "30", publicOffer: true }),
    ];
    expect(resolveDiscounts(rows, { offerPublicIds: ["a", "b"] }, 40).total).toBe(40);
  });
});
