import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/guards", () => ({
  requirePermission: vi.fn(async () => {
    throw new Error("forbidden");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/app-settings.service", () => ({ ensurePaymentCatalog: vi.fn() }));
vi.mock("@/lib/payments/stripe", () => ({
  stripeDeps: {},
  stripeRuntime: vi.fn(async () => null),
  webhookUrl: vi.fn(async () => "https://example.com/api/webhooks/stripe"),
}));

const { connectStripeAction, checkTaxReadinessAction } = await import("./actions");
const { requirePermission } = await import("@/lib/auth/guards");

describe("stripe settings actions", () => {
  it("require settings:write", async () => {
    const fd = new FormData();
    fd.set("secretKey", "rk_test_x");
    fd.set("publishableKey", "pk_test_x");
    const r = await connectStripeAction(fd);
    expect("error" in r).toBe(true);
    expect(requirePermission).toHaveBeenCalledWith({ settings: ["write"] });
  });

  it("tax readiness needs settings:read", async () => {
    await checkTaxReadinessAction("txcd_1");
    expect(requirePermission).toHaveBeenLastCalledWith({ settings: ["read"] });
  });

  it("returns the validation message and never echoes the secret", async () => {
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    const fd = new FormData();
    fd.set("secretKey", "rk_test_SUPERSECRET");
    fd.set("publishableKey", "pk_live_x");
    const r = await connectStripeAction(fd);
    expect("error" in r).toBe(true);
    expect(JSON.stringify(r)).toContain("same mode");
    expect(JSON.stringify(r)).not.toContain("SUPERSECRET");
  });
});
