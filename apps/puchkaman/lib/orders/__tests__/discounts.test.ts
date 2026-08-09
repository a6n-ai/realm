import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDiscounts, type DiscountSource } from "../discounts";

function row(over: Partial<DiscountSource> & { publicId: string; name: string }): DiscountSource {
  return {
    amount: null,
    percentage: null,
    active: true,
    publicOffer: false,
    couponCode: null,
    startsAt: null,
    expiresAt: null,
    minSubtotal: null,
    stackable: true,
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

describe("resolveDiscounts window, minimum spend and stacking", () => {
  // resolveDiscounts reads Date.now() internally (never injected), so boundary
  // tests pin the clock rather than racing real time.
  afterEach(() => vi.restoreAllMocks());

  const NOW = 1_700_000_000_000;

  it("does not apply a discount outside its window", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const notStarted = [
      row({ publicId: "future", name: "Future", amount: "5", publicOffer: true, startsAt: NOW + 1000 }),
    ];
    const expired = [
      row({ publicId: "past", name: "Past", amount: "5", publicOffer: true, expiresAt: NOW - 1000 }),
    ];
    expect(resolveDiscounts(notStarted, { offerPublicIds: ["future"] }, 40).total).toBe(0);
    expect(resolveDiscounts(expired, { offerPublicIds: ["past"] }, 40).total).toBe(0);
  });

  it("applies a discount exactly at startsAt and exactly at expiresAt", () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const atStart = [
      row({ publicId: "s", name: "S", amount: "5", publicOffer: true, startsAt: NOW }),
    ];
    const atExpiry = [
      row({ publicId: "e", name: "E", amount: "5", publicOffer: true, expiresAt: NOW }),
    ];
    expect(resolveDiscounts(atStart, { offerPublicIds: ["s"] }, 40).total).toBe(5);
    expect(resolveDiscounts(atExpiry, { offerPublicIds: ["e"] }, 40).total).toBe(5);
  });

  it("does not apply a discount below its minimum spend", () => {
    const rows = [
      row({ publicId: "min10", name: "Min $10", amount: "5", publicOffer: true, minSubtotal: "10.00" }),
    ];
    expect(resolveDiscounts(rows, { offerPublicIds: ["min10"] }, 5).total).toBe(0);
  });

  it("applies a discount exactly at its minimum spend, comparing numerically not as strings", () => {
    const rows = [
      row({ publicId: "min10", name: "Min $10", amount: "5", publicOffer: true, minSubtotal: "10.00" }),
    ];
    // A string comparison ("10.00" > "9") would pass here for the wrong reason;
    // the assertion below only holds if minSubtotal was Number()-converted.
    expect(resolveDiscounts(rows, { offerPublicIds: ["min10"] }, 10).total).toBe(5);
    expect(resolveDiscounts(rows, { offerPublicIds: ["min10"] }, 9).total).toBe(0);
  });

  it("uses a non-stackable discount alone rather than summing it with others", () => {
    const rows = [
      row({ publicId: "exclusive", name: "Exclusive $20", amount: "20", publicOffer: true, stackable: false }),
      row({ publicId: "small", name: "Small $2", amount: "2", publicOffer: true }),
    ];
    const r = resolveDiscounts(rows, { offerPublicIds: ["exclusive", "small"] }, 40);
    // Exclusive alone ($20) beats stacking the two stackable-only candidates
    // ($2), so the engine picks the exclusive discount by itself.
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0]?.publicId).toBe("exclusive");
    expect(r.total).toBe(20);
  });
});
