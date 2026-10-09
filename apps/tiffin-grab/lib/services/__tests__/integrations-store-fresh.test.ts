import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ row: { cfg: {} as Record<string, unknown> } }));

vi.mock("server-only", () => ({}));
vi.mock("@foundry/database", () => ({ UpdatableRepository: class {} }));
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => ({ limit: async () => [{ publicId: "app_1", cfg: h.row.cfg }] }) }) },
}));
vi.mock("@/lib/cache", () => {
  const m = new Map<string, unknown>();
  return {
    sharedCache: () => ({
      getOrSet: async (k: string, f: () => Promise<unknown>) => {
        if (!m.has(k)) m.set(k, await f());
        return m.get(k);
      },
      evictAll: async () => m.clear(),
    }),
  };
});
vi.mock("../session-service", () => ({
  SessionUpdatableService: class {
    async update(_id: string, patch: { integrationsConfig: Record<string, unknown> }) {
      h.row.cfg = patch.integrationsConfig;
      return {};
    }
  },
}));

const svc = await import("../app-settings.service");

describe("integrationsConfigStore (plugin writers)", () => {
  it("does not resurrect Stripe secrets from a stale cache", async () => {
    const secretKey = { v: 1, iv: "a", tag: "b", ct: "OLDSECRET" };
    h.row.cfg = { stripe: { installed: true, accountId: "acct_1", secretKey } };
    await svc.getIntegrationsConfig(); // primes this instance's cache with the secrets
    h.row.cfg = { stripe: { installed: false } }; // another instance's Disconnect

    const cur = await svc.integrationsConfigStore.get();
    await svc.integrationsConfigStore.set({ ...cur, googleReviews: { placeId: "p1" } } as never);

    expect(JSON.stringify(h.row.cfg)).not.toContain("OLDSECRET");
    expect((h.row.cfg as { googleReviews?: unknown }).googleReviews).toBeDefined();
  });
});
