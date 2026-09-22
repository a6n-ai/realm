import { describe, expect, it } from "vitest";
import { isHiddenFromCustomer, orderDisplayStatus } from "../display-status";

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
