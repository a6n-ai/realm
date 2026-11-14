import { describe, expect, it } from "vitest";
import { canTakeAddonPayment } from "../addon-eligibility";

describe("canTakeAddonPayment", () => {
  const wp = { deploymentId: "wc-123" };
  const own = { deploymentId: "tg-1" };
  const st = (s: string[]) => s.map((status) => ({ status }));

  it("allows a plan with settled money and nothing in review", () => {
    expect(canTakeAddonPayment(own, st(["paid"]))).toBeNull();
    expect(canTakeAddonPayment(own, st(["simulated_paid", "paid"]))).toBeNull();
    expect(canTakeAddonPayment(own, st(["paid", "refunded"]))).toBeNull();
  });

  it("allows a WordPress-prepaid plan with no payment rows", () => {
    expect(canTakeAddonPayment(wp, st([]))).toBeNull();
  });

  it("refuses while any payment is open", () => {
    for (const s of ["awaiting_payment", "pending_verification", "pending"]) {
      expect(canTakeAddonPayment(own, st(["paid", s]))).toBe("A payment is still pending on this plan. Confirm it first.");
    }
  });

  it("refuses a rejected payment even beside a paid one", () => {
    expect(canTakeAddonPayment(own, st(["rejected"]))).toMatch(/rejected/);
    expect(canTakeAddonPayment(own, st(["paid", "rejected"]))).toMatch(/rejected/);
  });

  it("refuses when no payment is confirmed", () => {
    expect(canTakeAddonPayment(own, st([]))).toBe("This plan has no confirmed payment yet.");
    expect(canTakeAddonPayment(own, st(["refunded"]))).toBe("This plan has no confirmed payment yet.");
    expect(canTakeAddonPayment(wp, st(["refunded"]))).toBe("This plan has no confirmed payment yet.");
  });

  it("refuses a second live add-on link, but not an expired one", () => {
    const link = (expiresAt: number) => ({ status: "awaiting_payment", addonRequest: {}, expiresAt });
    expect(canTakeAddonPayment(own, [{ status: "paid" }, link(2_000)], 1_000)).toBe("Regenerate or cancel the existing link first");
    expect(canTakeAddonPayment(own, [{ status: "paid" }, link(1_000)], 1_000)).toBeNull();
    expect(canTakeAddonPayment(own, [{ status: "paid" }, link(0)], 1_000)).toBeNull();
  });
});

