import { describe, expect, it } from "vitest";
import { grainForRange, resolveRevenueBounds, summarizeRevenue, type RevenuePaymentRow } from "../revenue";

const TZ = "America/Toronto";
const AT = Date.parse("2035-03-10T17:00:00Z");

function pay(over: Partial<RevenuePaymentRow> = {}): RevenuePaymentRow {
  return {
    orderId: "1",
    status: "paid",
    method: "etransfer",
    amount: 169.5,
    at: AT,
    orderTotal: 169.5,
    // $200 list − $20 cadence − $30 coupon = $150 taxable, + 13% HST = $169.50.
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

function run(payments: RevenuePaymentRow[], extra: Partial<Parameters<typeof summarizeRevenue>[0]> = {}) {
  return summarizeRevenue({
    from: "2035-03-01",
    to: "2035-03-31",
    timezone: TZ,
    payments,
    pending: [],
    ...extra,
  });
}

describe("summarizeRevenue", () => {
  it("builds the waterfall from the pricing snapshot and keeps tax out of net sales", () => {
    const { kpis } = run([pay()]);
    expect(kpis.grossSales).toBe(200);
    expect(kpis.discounts).toBe(50);
    expect(kpis.netSales).toBe(150);
    expect(kpis.tax).toBe(19.5);
    expect(kpis.netCollected).toBe(169.5);
    expect(kpis.discountRatePct).toBe(25);
    expect(kpis.avgOrderValue).toBe(150);
  });

  it("splits discounts into catalog, coupon and coin sources", () => {
    const withCoins = pay({
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
    });
    const { discounts, kpis } = run([withCoins]);
    const by = Object.fromEntries(discounts.map((d) => [d.source, d.amount]));
    expect(by).toEqual({ catalog: 20, coupon: 30, coins: 10 });
    expect(kpis.discounts).toBe(60);
    expect(discounts.reduce((s, d) => s + d.amount, 0)).toBe(kpis.discounts);
  });

  it("does not report a discount larger than the list price", () => {
    const over = pay({
      amount: 0,
      orderTotal: 0,
      snapshot: {
        subtotal: 100,
        taxTotal: 0,
        adjustments: [
          { label: "Coupon (BIG)", amount: 80 },
          { label: "Coins (1000)", amount: 40 },
        ],
      },
    });
    const { kpis, discounts } = run([over]);
    expect(kpis.grossSales).toBe(100);
    expect(kpis.netSales).toBe(0);
    expect(kpis.discounts).toBe(100);
    expect(discounts.reduce((s, d) => s + d.amount, 0)).toBe(100);
  });

  it("subtracts a refund once, not from both revenue and net", () => {
    const { kpis, trend } = run([pay(), pay({ orderId: "2", status: "refunded" })]);
    expect(kpis.collected).toBe(339);
    expect(kpis.refunded).toBe(169.5);
    expect(kpis.netCollected).toBe(169.5);
    expect(kpis.netSales).toBe(150);
    expect(kpis.orders).toBe(1);
    expect(trend.find((t) => t.period === "Mar 10")?.collected).toBe(169.5);
  });

  it("scales the snapshot by the share a partial payment covers", () => {
    const half = { amount: 84.75, orderTotal: 169.5 };
    const { kpis } = run([pay(half), pay(half)]);
    expect(kpis.netSales).toBe(150);
    expect(kpis.grossSales).toBe(200);
    expect(kpis.orders).toBe(1);
  });

  it("buckets by the business timezone and ignores payments outside the range", () => {
    // 03:00 UTC on 1 Mar is still 28 Feb in Toronto.
    const early = pay({ orderId: "3", at: Date.parse("2035-03-01T03:00:00Z") });
    const { kpis, trend } = run([pay(), early]);
    expect(kpis.orders).toBe(1);
    expect(trend).toHaveLength(31);
    expect(trend.find((t) => t.period === "Mar 10")?.netSales).toBe(150);
  });

  it("treats legacy snapshots with no subtotal as undiscounted, untaxed sales", () => {
    const { kpis } = run([pay({ snapshot: {}, amount: 100, orderTotal: 100 })]);
    expect(kpis.grossSales).toBe(100);
    expect(kpis.discounts).toBe(0);
    expect(kpis.netSales).toBe(100);
  });

  it("reports awaiting payments separately from revenue", () => {
    const { kpis } = run([], { pending: [{ amount: 80, at: AT }, { amount: 20, at: Date.parse("2035-04-02T12:00:00Z") }] });
    expect(kpis.pendingAmount).toBe(80);
    expect(kpis.pendingCount).toBe(1);
    expect(kpis.netSales).toBe(0);
  });
});

describe("resolveRevenueBounds", () => {
  const now = Date.parse("2035-03-10T16:00:00Z");

  it("defaults to month-to-date in the business timezone", () => {
    expect(resolveRevenueBounds(undefined, undefined, TZ, now)).toEqual({ from: "2035-03-01", to: "2035-03-10" });
  });

  it("keeps a picked calendar day instead of shifting it through the business timezone", () => {
    // 03:00 UTC on 1 Mar is still 28 Feb in Toronto. An ISO day must not move.
    expect(resolveRevenueBounds("2035-03-01", "2035-03-01", TZ, now)).toEqual({
      from: "2035-03-01",
      to: "2035-03-01",
    });
    expect(resolveRevenueBounds(String(Date.parse("2035-03-01T03:00:00Z")), undefined, TZ, now).from).toBe("2035-02-28");
  });

  it("swaps a reversed range", () => {
    expect(resolveRevenueBounds("2035-01-15", "2035-01-02", TZ, now)).toEqual({
      from: "2035-01-02",
      to: "2035-01-15",
    });
  });
});

describe("grainForRange", () => {
  it("widens the bucket as the range grows", () => {
    expect(grainForRange("2035-01-01", "2035-01-31")).toBe("daily");
    expect(grainForRange("2035-01-01", "2035-04-30")).toBe("weekly");
    expect(grainForRange("2035-01-01", "2035-12-31")).toBe("monthly");
  });
});
