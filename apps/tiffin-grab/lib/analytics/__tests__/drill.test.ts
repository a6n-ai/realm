import { describe, expect, it } from "vitest";
import { isoDateInZone } from "../profitability";
import { customersHref, inquiriesHref, ordersDrillHref, ordersHref, paymentsHref, zonedRangeMs } from "../drill";
import type { AnalyticsScope } from "@/lib/services/analytics/metrics/scope";
import { presentPaymentStatuses } from "../revenue";

const TZ = "America/Toronto";

describe("zonedRangeMs", () => {
  it("covers the calendar day in the business timezone, including the edges", () => {
    const { from, to } = zonedRangeMs("2035-03-01", "2035-03-01", TZ);
    expect(isoDateInZone(from, TZ)).toBe("2035-03-01");
    expect(isoDateInZone(to, TZ)).toBe("2035-03-01");
    expect(isoDateInZone(from - 1, TZ)).toBe("2035-02-28");
    expect(isoDateInZone(to + 1, TZ)).toBe("2035-03-02");
  });

  it("spans an inclusive multi-day range", () => {
    const { from, to } = zonedRangeMs("2035-03-01", "2035-03-03", TZ);
    expect(isoDateInZone(from, TZ)).toBe("2035-03-01");
    expect(isoDateInZone(to, TZ)).toBe("2035-03-03");
    expect(isoDateInZone(to + 1, TZ)).toBe("2035-03-04");
  });
});

const scope = (over: Partial<AnalyticsScope> = {}): AnalyticsScope => ({
  orgIds: "all", fromMs: 10, toMs: 20, tz: TZ, plans: [], mealSizes: [], zones: [], extra: {}, ...over,
});

describe("drill-through links", () => {
  it("builds a payments link carrying the scope's dates", () => {
    expect(paymentsHref(scope(), { statuses: ["paid", "simulated_paid"], methods: ["etransfer"], basis: "money" })).toBe(
      "/dashboard/payments/all?basis=money&status=paid%2Csimulated_paid&method=etransfer&from=10&to=20",
    );
  });

  it("carries the franchise, and drops it when it adds nothing", () => {
    const sub = scope({ orgIds: ["a"] });
    expect(paymentsHref(sub)).toContain("org=a");
    expect(inquiriesHref(sub, { stage: "lost" })).toBe("/dashboard/inquiries?from=10&to=20&org=a&stage=lost");
    expect(customersHref(sub, ["a"])).toBe("/dashboard/customers?from=10&to=20");
    expect(customersHref(scope({ orgIds: ["a", "b"] }), ["a", "b", "c"])).toContain("org=a%2Cb");
    expect(customersHref(scope())).toBe("/dashboard/customers?from=10&to=20");
  });

  it("never serializes an empty franchise list as an empty value", () => {
    expect(inquiriesHref(scope({ orgIds: [] }))).toContain("org=none");
  });

  it("builds an orders link from the same facets the listing reads, with at most one status", () => {
    expect(ordersHref(scope({ plans: ["veg"] }), { status: ["active"] })).toBe(
      "/dashboard/orders?from=10&to=20&status=active&plan=veg&view=all",
    );
    expect(ordersDrillHref).toBe(ordersHref);
    expect(() => ordersHref(scope(), { status: ["active", "paused"] })).toThrow();
  });

  it("builds inquiry links from the facet names that list reads", () => {
    expect(inquiriesHref(scope(), { stage: "converted", source: "instagram" })).toBe(
      "/dashboard/inquiries?from=10&to=20&stage=converted&source=instagram",
    );
  });
});

describe("presentPaymentStatuses", () => {
  it("keeps a stable order and drops empty statuses", () => {
    expect(
      presentPaymentStatuses([
        { status: "refunded", count: 1, amount: 10 },
        { status: "paid", count: 2, amount: 40.2 },
        { status: "rejected", count: 0, amount: 0 },
      ]),
    ).toEqual([
      { status: "paid", label: "Paid", count: 2, amount: 40.2 },
      { status: "refunded", label: "Refunded", count: 1, amount: 10 },
    ]);
  });
});
