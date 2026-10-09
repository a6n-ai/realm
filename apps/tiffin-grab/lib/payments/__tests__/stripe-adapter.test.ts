import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/services/app-settings.service", () => {
  let blob: Record<string, unknown> = {};
  const stale = { stripe: { installed: true, accountId: "acct_old", secretKey: { v: 1, iv: "a", tag: "b", ct: "OLD" } } };
  return {
    getIntegrationsConfig: async () => ({ ...stale }),
    getIntegrationsConfigFresh: async () => blob,
    setIntegrationsConfig: async (b: Record<string, unknown>) => { blob = b; },
    getPaymentConfig: async () => ({ methods: [] }),
    __set: (b: Record<string, unknown>) => { blob = b; },
  };
});

const settings = (await import("@/lib/services/app-settings.service")) as unknown as { __set: (b: Record<string, unknown>) => void };
const { stripeRuntime, stripeDeps, toCents, fromCents } = await import("../stripe");

describe("stripe adapter", () => {
  beforeEach(() => settings.__set({}));

  it("converts money exactly", () => {
    expect(toCents("204.80")).toBe(20480);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(fromCents(20480)).toBe("204.80");
  });

  it("returns null (never throws) when not connected", async () => {
    await expect(stripeRuntime()).resolves.toBeNull();
  });

  it("returns null when the master key is missing", async () => {
    const prev = process.env.INTEGRATIONS_ENCRYPTION_KEY;
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
    settings.__set({ stripe: { installed: true, accountId: "acct_1", secretKey: { v: 1, iv: "a", tag: "b", ct: "c" } } });
    await expect(stripeRuntime()).resolves.toBeNull();
    if (prev !== undefined) process.env.INTEGRATIONS_ENCRYPTION_KEY = prev;
  });

  it("writers start from the DB, not a stale cache (no secret resurrection after disconnect)", async () => {
    settings.__set({ stripe: { installed: false } }); // post-disconnect truth
    const { updateStripeSettings } = await import("@foundry/payments/stripe");
    await updateStripeSettings(stripeDeps, { methodLabel: "Credit card" });
    const out = (await stripeDeps.store.get()) as { stripe: Record<string, unknown> };
    expect(out.stripe.secretKey).toBeUndefined();
    expect(out.stripe.accountId).toBeUndefined();
  });
});
