import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { isoDateInZone } from "@/lib/analytics/profitability";
import { PgDialect } from "drizzle-orm/pg-core";
import { NoFranchiseAccessError, resolveAnalyticsScope, buildAnalyticsScope, intersectOrgs, ordersScope, scopeToSearchParams } from "../scope";

const toSql = (q: ReturnType<typeof ordersScope>) => new PgDialect().sqlToQuery(q!).sql;

const visibleMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/orders.service", () => ({ resolveSessionVisibleOrgIds: visibleMock }));
vi.mock("@/lib/services/app-settings.service", () => ({ getAppSettings: async () => ({ timezone: "America/Toronto" }) }));

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

describe("ordersScope", () => {
  it("is a false condition for an empty visible set", () => {
    const s = buildAnalyticsScope({}, [], TZ);
    expect(toSql(ordersScope(s))).toBe("false");
  });
  it("is a false condition for an org outside the visible set", () => {
    const s = buildAnalyticsScope({ org: "B" }, ["A"], TZ);
    expect(s.orgIds).toEqual([]);
    expect(toSql(ordersScope(s))).toBe("false");
  });
  it("filters on the order's organization_id when scoped, nothing when all", () => {
    expect(toSql(ordersScope(buildAnalyticsScope({}, ["A"], TZ)))).toContain("organization_id");
    expect(ordersScope(buildAnalyticsScope({}, "all", TZ))).toBeUndefined();
  });
});

describe("resolveAnalyticsScope", () => {
  const session = { user: { id: "u" } };
  it("throws no_visible_orgs when the session sees no orgs", async () => {
    visibleMock.mockResolvedValue([]);
    await expect(resolveAnalyticsScope({}, session)).rejects.toMatchObject({ reason: "no_visible_orgs" });
  });
  it("throws org_not_visible when the URL org is outside the visible set", async () => {
    visibleMock.mockResolvedValue(["A"]);
    const err = await resolveAnalyticsScope({ org: "B" }, session).catch((e) => e);
    expect(err).toBeInstanceOf(NoFranchiseAccessError);
    expect(err.reason).toBe("org_not_visible");
  });
  it("resolves normally otherwise", async () => {
    visibleMock.mockResolvedValue(["A"]);
    expect((await resolveAnalyticsScope({ org: "A,B" }, session)).orgIds).toEqual(["A"]);
    visibleMock.mockResolvedValue("all");
    expect((await resolveAnalyticsScope({}, session)).orgIds).toBe("all");
  });
});
