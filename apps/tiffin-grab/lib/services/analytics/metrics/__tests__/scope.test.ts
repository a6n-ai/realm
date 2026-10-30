import { describe, expect, it } from "vitest";
import { isoDateInZone } from "@/lib/analytics/profitability";
import { buildAnalyticsScope, intersectOrgs, scopeToSearchParams } from "../scope";

const TZ = "America/Toronto";

describe("org intersection", () => {
  it("keeps all when visible is all and org is absent", () => {
    expect(buildAnalyticsScope({}, "all", TZ).orgIds).toBe("all");
  });
  it("narrows all to the requested orgs", () => {
    expect(intersectOrgs("all", ["A", "B"])).toEqual(["A", "B"]);
  });
  it("yields [] when the requested org is not visible", () => {
    expect(buildAnalyticsScope({ org: "B" }, ["A"], TZ).orgIds).toEqual([]);
  });
  it("drops invisible orgs from a list", () => {
    expect(buildAnalyticsScope({ org: "A,B" }, ["A"], TZ).orgIds).toEqual(["A"]);
  });
  it("never widens an empty visible set", () => {
    expect(buildAnalyticsScope({}, [], TZ).orgIds).toEqual([]);
  });
});

describe("default window", () => {
  it("is the Toronto month at 00:30 local on the 1st (04:30Z, still UTC the 1st)", () => {
    const s = buildAnalyticsScope({}, "all", TZ, Date.parse("2035-03-01T05:30:00Z"));
    expect(isoDateInZone(s.fromMs, TZ)).toBe("2035-03-01");
    expect(isoDateInZone(s.toMs, TZ)).toBe("2035-03-31");
  });
  it("is still the previous month at 23:30 local on the last day (UTC already the 1st)", () => {
    const s = buildAnalyticsScope({}, "all", TZ, Date.parse("2035-04-01T03:30:00Z"));
    expect(isoDateInZone(s.fromMs, TZ)).toBe("2035-03-01");
  });
});

describe("scopeToSearchParams", () => {
  const sp = { from: "100", to: "200", org: "A,B", plan: "p", mealSize: "m1,m2", zone: "Z", method: "cash" };
  it("round trips", () => {
    const s = buildAnalyticsScope(sp, "all", TZ);
    const back = buildAnalyticsScope(Object.fromEntries(scopeToSearchParams(s)), "all", TZ);
    expect(back).toEqual(s);
    expect(s.extra).toEqual({ method: ["cash"] });
  });
  it("round trips an empty org set without widening", () => {
    const s = buildAnalyticsScope({ org: "B" }, ["A"], TZ);
    const back = buildAnalyticsScope(Object.fromEntries(scopeToSearchParams(s)), ["A"], TZ);
    expect(back.orgIds).toEqual([]);
  });
});
