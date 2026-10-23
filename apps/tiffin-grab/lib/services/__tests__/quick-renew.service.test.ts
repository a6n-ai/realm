import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/tenant/resolve-request-org", () => ({ resolveRequestOrg: async () => null }));
vi.mock("server-only", () => ({}));

const { pickRenewSource } = await import("../quick-renew.service");

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
