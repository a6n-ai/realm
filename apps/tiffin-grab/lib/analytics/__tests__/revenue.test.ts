import { describe, expect, it } from "vitest";
import { grainForRange, summarizeDiscounts, type DiscountOrderRow } from "../revenue";

function order(over: Partial<DiscountOrderRow> = {}): DiscountOrderRow {
  return {
    orderId: "1",
    amount: 169.5,
    orderTotal: 169.5,
    // $200 list - $20 cadence - $30 coupon = $150 taxable, + 13% HST = $169.50.
    snapshot: {
      subtotal: 200,
      taxTotal: 19.5,
      total: 169.5,
      adjustments: [
        { label: "Coupon (SAVE30)", amount: 30 },
        { label: "4-week discount", amount: 20, discountKey: "weeks_4" },
      ],
    },
    ...over,
  };
}

describe("summarizeDiscounts", () => {
  it("folds staff codes into one line, per employee: shared owner merges, ownerless shows its code", () => {
    const snap = (code: string, amt: number) => ({
      subtotal: 100,
      taxTotal: 0,
      adjustments: [{ label: `Staff discount (${code})`, amount: amt }],
    });
    const r = summarizeDiscounts([
      order({ orderId: "1", amount: 90, orderTotal: 90, snapshot: snap("TG-AAA", 10), staffCodes: [{ code: "TG-AAA", owner: "Asha" }] }),
      order({ orderId: "2", amount: 95, orderTotal: 95, snapshot: snap("TG-BBB", 5), staffCodes: [{ code: "TG-BBB", owner: "Asha" }] }),
      order({ orderId: "3", amount: 98, orderTotal: 98, snapshot: snap("TG-CCC", 2), staffCodes: [{ code: "TG-CCC", owner: null }] }),
    ]);
    expect(r.lines).toEqual([
      {
        source: "staff",
        label: "Staff discounts",
        amount: 17,
        orders: 3,
        codes: [{ name: "Asha", amount: 15, orders: 2 }, { name: "TG-CCC", amount: 2, orders: 1 }],
      },
    ]);
    expect(r.discounts).toBe(17);
  });

  it("reports list price and discounts from the snapshot, keeping tax out", () => {
    const r = summarizeDiscounts([order()]);
    expect(r).toMatchObject({ listPrice: 200, discounts: 50, orders: 1 });
  });

  it("splits discounts into catalog, coupon and coin sources", () => {
    const r = summarizeDiscounts([
      order({
        amount: 158.2,
        orderTotal: 158.2,
        snapshot: {
          subtotal: 200,
          taxTotal: 18.2,
          adjustments: [
            { label: "4-week discount", amount: 20, discountKey: "weeks_4" },
            { label: "Coupon (SAVE30)", amount: 30 },
            { label: "Coins (1000)", amount: 10 },
          ],
        },
      }),
    ]);
    expect(Object.fromEntries(r.lines.map((d) => [d.source, d.amount]))).toEqual({ catalog: 20, coupon: 30, coins: 10 });
    expect(r.discounts).toBe(60);
  });

  it("does not report a discount larger than the list price", () => {
    const r = summarizeDiscounts([
      order({
        amount: 0,
        orderTotal: 0,
        snapshot: { subtotal: 100, taxTotal: 0, adjustments: [{ label: "Coupon (BIG)", amount: 80 }, { label: "Coins (1000)", amount: 40 }] },
      }),
    ]);
    expect(r.discounts).toBe(100);
    expect(r.lines.reduce((s, d) => s + d.amount, 0)).toBe(100);
  });

  it("scales the snapshot by the share a partial payment covers", () => {
    const r = summarizeDiscounts([order({ amount: 84.75 })]);
    expect(r).toMatchObject({ listPrice: 100, discounts: 25 });
  });

  it("treats legacy snapshots with no subtotal as undiscounted, untaxed sales", () => {
    const r = summarizeDiscounts([order({ snapshot: {} })]);
    expect(r).toMatchObject({ listPrice: 169.5, discounts: 0, lines: [] });
  });
});

describe("grainForRange", () => {
  it("widens the bucket as the range grows", () => {
    expect(grainForRange("2035-01-01", "2035-01-31")).toBe("daily");
    expect(grainForRange("2035-01-01", "2035-04-30")).toBe("weekly");
    expect(grainForRange("2035-01-01", "2035-12-31")).toBe("monthly");
  });
});
