import { describe, expect, it } from "vitest";
import { isoDateInZone } from "../profitability";
import { inquiriesHref, ordersHref, paymentsHref, zonedRangeMs } from "../drill";
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

describe("drill-through links", () => {
  it("builds a payments link the list can filter", () => {
    expect(
      paymentsHref({ statuses: ["paid", "simulated_paid"], methods: ["etransfer"], fromMs: 10, toMs: 20 }),
    ).toBe("/dashboard/payments/all?status=paid%2Csimulated_paid&method=etransfer&from=10&to=20");
  });

  it("builds order and inquiry links from the facet names those lists read", () => {
    expect(ordersHref({ status: "active" })).toBe("/dashboard/orders?status=active");
    expect(ordersHref({ plan: "veg" })).toBe("/dashboard/orders?plan=veg");
    expect(inquiriesHref({ stage: "converted", source: "instagram" })).toBe(
      "/dashboard/inquiries?stage=converted&source=instagram",
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
