import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { DATE_PRESETS, presetRange } from "@/lib/analytics/date-presets";
import { PgDialect } from "drizzle-orm/pg-core";
import { NoFranchiseAccessError, resolveAnalyticsScope, buildAnalyticsScope, intersectOrgs, ordersScope } from "../scope";
import { isoDateInZone } from "@foundry/commons/util/dates";

const toSql = (q: ReturnType<typeof ordersScope>) => new PgDialect().sqlToQuery(q!).sql;

const visibleMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/visible-orgs", () => ({ resolveSessionVisibleOrgIds: visibleMock }));
vi.mock("@/lib/settings", () => ({ getAppSettings: async () => ({ timezone: "America/Toronto" }) }));

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

describe("date presets round-trip through the scope parser", () => {
  it.each(DATE_PRESETS.map((p) => p.key))("%s keeps its from/to", (key) => {
    const now = Date.parse("2026-10-20T15:00:00Z");
    const r = presetRange(key, TZ, now);
    const scope = buildAnalyticsScope({ from: String(r.from), to: String(r.to) }, "all", TZ, now);
    expect([scope.fromMs, scope.toMs]).toEqual([r.from, r.to]);
  });
});
