import { describe, expect, it } from "vitest";
import { canTakeAddonPayment, cardPayClosed, complimentaryBlocker, isHiddenFromCustomer, orderDisplayStatus } from "../display-status";

describe("orderDisplayStatus", () => {
  it("overlays Active with Payment review while money is unpaid or claimed", () => {
    expect(orderDisplayStatus("active", ["awaiting_payment"])).toBe("payment_review");
    expect(orderDisplayStatus("active", ["pending_verification"])).toBe("payment_review");
    expect(orderDisplayStatus("paused", ["awaiting_payment"])).toBe("payment_review");
    expect(orderDisplayStatus("pending", ["pending_verification"])).toBe("payment_review");
  });

  it("overlays Rejected when the claim was denied and nothing is settled or re-queued", () => {
    expect(orderDisplayStatus("active", ["rejected"])).toBe("rejected");
    expect(orderDisplayStatus("paused", ["rejected"])).toBe("rejected");
  });

  it("prefers Payment review over Rejected when the customer re-claimed", () => {
    expect(orderDisplayStatus("active", ["rejected", "pending_verification"])).toBe("payment_review");
  });

  it("keeps Active once payment is settled; maps paused/upcoming to Active", () => {
    expect(orderDisplayStatus("active", ["paid"])).toBe("active");
    expect(orderDisplayStatus("active", ["simulated_paid"])).toBe("active");
    expect(orderDisplayStatus("paused", ["paid"])).toBe("active");
    expect(orderDisplayStatus("upcoming", ["paid"])).toBe("active");
    expect(orderDisplayStatus("active", [])).toBe("active");
    expect(orderDisplayStatus("active", [null])).toBe("active");
  });

  it("does not hide waitlisted / cancelled behind payment overlays", () => {
    expect(orderDisplayStatus("waitlisted", ["awaiting_payment"])).toBe("waitlisted");
    expect(orderDisplayStatus("cancelled", ["pending_verification"])).toBe("cancelled");
    expect(orderDisplayStatus("cancelled", ["rejected"])).toBe("cancelled");
  });

  it("leaves Completed alone", () => {
    expect(orderDisplayStatus("completed", ["paid"])).toBe("completed");
    expect(orderDisplayStatus("completed", ["rejected"])).toBe("completed");
  });
});

describe("isHiddenFromCustomer", () => {
  it("hides rejected unpaid plans from /me", () => {
    expect(isHiddenFromCustomer(["rejected"])).toBe(true);
  });

  it("keeps payment-review and settled plans visible", () => {
    expect(isHiddenFromCustomer(["awaiting_payment"])).toBe(false);
    expect(isHiddenFromCustomer(["pending_verification"])).toBe(false);
    expect(isHiddenFromCustomer(["rejected", "pending_verification"])).toBe(false);
    expect(isHiddenFromCustomer(["paid"])).toBe(false);
    expect(isHiddenFromCustomer([])).toBe(false);
  });
});

describe("complimentaryBlocker", () => {
  it("allows a settled active or finished plan, and a WordPress plan with no payment rows", () => {
    expect(complimentaryBlocker("active", ["paid"])).toBeNull();
    expect(complimentaryBlocker("completed", ["simulated_paid"])).toBeNull();
    expect(complimentaryBlocker("active", [])).toBeNull();
  });
  it("refuses pending payment, rejected payment, and plans that aren't running or over", () => {
    expect(complimentaryBlocker("active", ["awaiting_payment"])).toMatch(/pending/);
    expect(complimentaryBlocker("active", ["paid", "pending_verification"])).toMatch(/pending/);
    expect(complimentaryBlocker("active", ["rejected"])).toMatch(/rejected/);
    expect(complimentaryBlocker("pending", [])).toMatch(/active plan/);
    expect(complimentaryBlocker("cancelled", ["paid"])).toMatch(/active plan/);
  });
});

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

describe("cardPayClosed", () => {
  const now = 1_000_000;
  it("is open for a live link on a running or pending order", () => {
    expect(cardPayClosed("pending", now + 1, now)).toBeNull();
    expect(cardPayClosed("active", null, now)).toBeNull();
  });
  it("closes on a cancelled order, an expired link and a void link (expiresAt 0)", () => {
    expect(cardPayClosed("cancelled", null, now)).toMatch(/cancelled/);
    expect(cardPayClosed("pending", now, now)).toMatch(/expired/);
    expect(cardPayClosed("active", 0, now)).toMatch(/expired/);
  });
});
