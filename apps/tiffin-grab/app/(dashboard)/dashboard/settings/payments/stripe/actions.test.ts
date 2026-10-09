import { beforeEach, describe, expect, it, vi } from "vitest";

const { rt, taxReadinessMock, disconnectMock, cfgState } = vi.hoisted(() => ({
  rt: { current: null as unknown },
  taxReadinessMock: vi.fn(),
  disconnectMock: vi.fn(async () => {}),
  cfgState: { cfg: { methods: [{ id: "stripe", kind: "online", enabled: false, label: "Card", taxes: [] }] } as any },
}));

vi.mock("@/lib/auth/guards", () => ({
  requirePermission: vi.fn(async () => {
    throw new Error("forbidden");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/app-settings.service", () => ({
  ensurePaymentCatalog: vi.fn(),
  getPaymentConfig: vi.fn(async () => cfgState.cfg),
  setPaymentConfig: vi.fn(async (c: unknown) => { cfgState.cfg = c; }),
}));
vi.mock("@/lib/payments/stripe", () => ({
  stripeDeps: {},
  stripeRuntime: vi.fn(async () => rt.current),
  webhookUrl: vi.fn(async () => "https://example.com/api/webhooks/stripe"),
}));
vi.mock("@foundry/payments/stripe", async (orig) => ({
  ...(await orig<typeof import("@foundry/payments/stripe")>()),
  taxReadiness: taxReadinessMock,
  disconnectStripe: disconnectMock,
}));

const a = await import("./actions");
const { requirePermission } = await import("@/lib/auth/guards");
const allow = () => (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
const enabled = () => cfgState.cfg.methods[0].enabled;

beforeEach(() => {
  rt.current = null;
  cfgState.cfg = { methods: [{ id: "stripe", kind: "online", enabled: false, label: "Card", taxes: [] }] };
});

describe("stripe settings actions", () => {
  it("require settings:write", async () => {
    const fd = new FormData();
    fd.set("secretKey", "rk_test_x");
    fd.set("publishableKey", "pk_test_x");
    const r = await a.connectStripeAction(fd);
    expect("error" in r).toBe(true);
    expect(requirePermission).toHaveBeenCalledWith({ settings: ["write"] });
  });

  it("tax readiness needs settings:read", async () => {
    await a.checkTaxReadinessAction("txcd_1");
    expect(requirePermission).toHaveBeenLastCalledWith({ settings: ["read"] });
  });

  it("returns the validation message and never echoes the secret", async () => {
    allow();
    const fd = new FormData();
    fd.set("secretKey", "rk_test_SUPERSECRET");
    fd.set("publishableKey", "pk_live_x");
    const r = await a.connectStripeAction(fd);
    expect(JSON.stringify(r)).toContain("same mode");
    expect(JSON.stringify(r)).not.toContain("SUPERSECRET");
  });

  it("refuses enabling when not connected, toggles when connected", async () => {
    allow();
    expect(await a.setStripeEnabledAction(true)).toEqual({ error: "Connect Stripe first" });
    expect(enabled()).toBe(false);
    rt.current = { stripe: {}, cfg: {} };
    allow();
    expect(await a.setStripeEnabledAction(true)).toEqual({ ok: true });
    expect(enabled()).toBe(true);
    allow();
    expect(await a.setStripeEnabledAction(false)).toEqual({ ok: true });
    expect(enabled()).toBe(false);
  });

  it("disconnect disables the method", async () => {
    cfgState.cfg.methods[0].enabled = true;
    allow();
    expect(await a.disconnectStripeAction()).toEqual({ ok: true });
    expect(disconnectMock).toHaveBeenCalled();
    expect(enabled()).toBe(false);
  });

  it("test event refuses live mode", async () => {
    rt.current = { stripe: {}, cfg: { livemode: true } };
    allow();
    expect(await a.sendTestEventAction()).toEqual({ error: "Test events are only available in test mode" });
  });

  it("save refuses tax.enabled when readiness fails", async () => {
    rt.current = { stripe: {}, cfg: {} };
    taxReadinessMock.mockResolvedValueOnce({ ok: false });
    allow();
    const r = await a.saveStripeSettingsAction({ tax: { enabled: true, taxCode: "txcd_1", surchargeTaxable: false } });
    expect(JSON.stringify(r)).toContain("not ready");
  });

  it("maps a Stripe auth error to the reconnect message", async () => {
    rt.current = { stripe: {}, cfg: {} };
    taxReadinessMock.mockRejectedValueOnce({ type: "StripeAuthenticationError" });
    allow();
    expect(await a.checkTaxReadinessAction("txcd_1")).toEqual({
      error: "Stripe rejected the stored key — use Replace key to reconnect.",
    });
  });
});
