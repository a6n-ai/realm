import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ where: vi.fn(), stripe: vi.fn(), methods: vi.fn() }));
vi.mock("@/db/client", () => ({ db: { select: () => ({ from: () => ({ where: (c: unknown) => { m.where(c); return { limit: async () => [{ publicId: "ord_9" }] }; } }) }) } }));
vi.mock("@/lib/payments/stripe", () => ({ stripeMethodAvailable: m.stripe }));
vi.mock("../app-settings.service", () => ({ getPaymentConfig: async () => ({}) }));
vi.mock("@foundry/payments", () => ({ enabledMethods: () => m.methods() }));
vi.mock("@/lib/tenant/resolve-request-org", () => ({ resolveRequestOrg: async () => null }));
vi.mock("server-only", () => ({}));

import { PgDialect } from "drizzle-orm/pg-core";
const { pickRenewSource, findUnpaidRenewal, defaultPaymentMethodId } = await import("../quick-renew.service");
const sqlOf = (c: unknown) => new PgDialect().sqlToQuery(c as never);

const row = (status: string, endDate: string | null, trialLength: number | null = null) => ({ status, endDate, trialLength });

describe("pickRenewSource", () => {
  it("ignores cancelled, waitlisted, pending and trial rows", () => {
    const rows = [row("cancelled", "2026-12-01"), row("waitlisted", "2026-12-02"), row("pending", "2026-12-03"), row("active", "2026-12-04", 3)];
    expect(pickRenewSource(rows)).toBeNull();
  });

  it("prefers the queued plan that ends after the running one", () => {
    const running = row("active", "2026-11-01");
    const queued = row("upcoming", "2026-11-29");
    expect(pickRenewSource([running, queued])).toBe(queued);
  });

  it("returns null with no rows", () => {
    expect(pickRenewSource([])).toBeNull();
  });
});

describe("findUnpaidRenewal", () => {
  it("scopes to the organization and skips the source order when given one", async () => {
    await findUnpaidRenewal({ userId: 1n, organizationId: "org_1", publicId: "ord_1", startDate: "2026-11-01" });
    const q = sqlOf(m.where.mock.calls.at(-1)![0]);
    expect(q.sql).toContain('"organization_id" = $');
    expect(q.params).toContain("org_1");
    expect(q.params).toContain("ord_1");
  });

  it("customer form: org and owner only, no source-order conditions", async () => {
    await findUnpaidRenewal({ userId: 1n, organizationId: null });
    const q = sqlOf(m.where.mock.calls.at(-1)![0]);
    expect(q.sql).toContain('"organization_id" is null');
    expect(q.sql).not.toContain("<>");
  });

  it("is null without an owner", async () => {
    expect(await findUnpaidRenewal({ userId: null, organizationId: "org_1" })).toBeNull();
  });
});

describe("defaultPaymentMethodId", () => {
  it("is stripe when live, else the source method if enabled, else the first enabled", async () => {
    m.methods.mockReturnValue([{ id: "cash" }, { id: "etransfer" }]);
    m.stripe.mockResolvedValue(true);
    expect(await defaultPaymentMethodId("etransfer")).toBe("stripe");
    m.stripe.mockResolvedValue(false);
    expect(await defaultPaymentMethodId("etransfer")).toBe("etransfer");
    expect(await defaultPaymentMethodId("gone")).toBe("cash");
    expect(await defaultPaymentMethodId(null)).toBe("cash");
  });
});
