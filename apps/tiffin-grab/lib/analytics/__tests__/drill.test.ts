import { describe, expect, it } from "vitest";
import { inquiriesHref, ordersDrillHref, paymentsHref } from "../drill";
import { presetRange } from "@/lib/analytics/date-presets";
import { currentMonthEpochRange, zonedRangeMs } from "@/lib/dates/epoch-window";
import type { AnalyticsScope } from "@/lib/analytics/scope-types";
import { presentPaymentStatuses } from "../revenue";
import { isoDateInZone } from "@foundry/commons/util/dates";

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

const WINDOW = zonedRangeMs("2035-01-05", "2035-01-20", TZ);

const scope = (over: Partial<AnalyticsScope> = {}): AnalyticsScope => ({
  orgIds: "all", visible: "all", fromMs: WINDOW.from, toMs: WINDOW.to, tz: TZ, plans: [], mealSizes: [], zones: [], extra: {}, ...over,
});

describe("drill-through links", () => {
  it("builds a payments link carrying the scope's dates", () => {
    expect(paymentsHref(scope(), { statuses: ["paid", "simulated_paid"], methods: ["etransfer"], basis: "money" })).toBe(
      "/dashboard/payments/all?basis=money&status=paid%2Csimulated_paid&method=etransfer&from=2035-01-05&to=2035-01-20",
    );
  });

  it("carries the franchise, and drops it when it adds nothing", () => {
    const sub = scope({ orgIds: ["a"] });
    expect(paymentsHref(sub)).toContain("org=a");
    expect(inquiriesHref(sub, { stage: "lost" })).toBe("/dashboard/inquiries?from=2035-01-05&to=2035-01-20&org=a&stage=lost");
    expect(inquiriesHref({ ...sub, visible: ["a"] })).toBe("/dashboard/inquiries?from=2035-01-05&to=2035-01-20");
    expect(inquiriesHref(scope({ orgIds: ["a", "b"], visible: ["a", "b", "c"] }))).toContain("org=a%2Cb");
    expect(inquiriesHref(scope())).toBe("/dashboard/inquiries?from=2035-01-05&to=2035-01-20");
  });

  it("never serializes an empty franchise list as an empty value", () => {
    expect(inquiriesHref(scope({ orgIds: [] }))).toContain("org=none");
  });

  it("builds an orders link from the same facets the listing reads, with at most one status", () => {
    expect(ordersDrillHref(scope({ plans: ["veg"] }), { status: ["active"] })).toBe(
      "/dashboard/orders?from=2035-01-05&to=2035-01-20&status=active&plan=veg&view=all",
    );
    expect(() => ordersDrillHref(scope(), { status: ["active", "paused"] })).toThrow();
  });

  it("builds inquiry links from the facet names that list reads", () => {
    expect(inquiriesHref(scope(), { stage: "converted", source: "instagram" })).toBe(
      "/dashboard/inquiries?from=2035-01-05&to=2035-01-20&stage=converted&source=instagram",
    );
  });
});

describe("drill date params", () => {
  it("writes nothing for the default month and a key for a preset", () => {
    const now = Date.now();
    const month = presetRange("this-month", TZ, now);
    expect(inquiriesHref(scope({ fromMs: month.from, toMs: month.to, relative: true }))).toBe("/dashboard/inquiries");
    const week = presetRange("last-7", TZ, now);
    expect(inquiriesHref(scope({ fromMs: week.from, toMs: week.to, relative: true }))).toBe("/dashboard/inquiries?range=last-7");
  });

  it("keeps exact epochs for a window that is not on day edges", () => {
    expect(inquiriesHref(scope({ fromMs: 10, toMs: 20 }))).toBe("/dashboard/inquiries?from=10&to=20");
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

describe("drill dates stay frozen unless the scope is relative", () => {
  const last7 = presetRange("last-7", TZ);
  const month = currentMonthEpochRange(TZ);
  const iso = (ms: number) => isoDateInZone(ms, TZ);
  it("an explicit window equal to a preset or the month keeps ISO dates", () => {
    expect(paymentsHref(scope({ fromMs: last7.from, toMs: last7.to }))).toBe(
      `/dashboard/payments/all?from=${iso(last7.from)}&to=${iso(last7.to)}`,
    );
    expect(paymentsHref(scope({ fromMs: month.from, toMs: month.to }))).toBe(
      `/dashboard/payments/all?from=${iso(month.from)}&to=${iso(month.to)}`,
    );
  });
  it("a relative scope writes the preset key, or nothing for the default month", () => {
    expect(paymentsHref(scope({ fromMs: last7.from, toMs: last7.to, relative: true }))).toBe("/dashboard/payments/all?range=last-7");
    expect(paymentsHref(scope({ fromMs: month.from, toMs: month.to, relative: true }))).toBe("/dashboard/payments/all");
  });
});
