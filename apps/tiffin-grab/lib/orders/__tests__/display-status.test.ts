import { describe, expect, it } from "vitest";
import { orderDisplayStatus } from "../display-status";

describe("orderDisplayStatus", () => {
  it("overlays Active with Payment review while money is unpaid or claimed", () => {
    expect(orderDisplayStatus("active", ["awaiting_payment"])).toBe("payment_review");
    expect(orderDisplayStatus("active", ["pending_verification"])).toBe("payment_review");
    expect(orderDisplayStatus("paused", ["awaiting_payment"])).toBe("payment_review");
    expect(orderDisplayStatus("pending", ["pending_verification"])).toBe("payment_review");
  });

  it("keeps the real order status once payment is settled or absent", () => {
    expect(orderDisplayStatus("active", ["paid"])).toBe("active");
    expect(orderDisplayStatus("active", ["simulated_paid"])).toBe("active");
    expect(orderDisplayStatus("active", [])).toBe("active");
    expect(orderDisplayStatus("active", [null])).toBe("active");
  });

  it("does not hide waitlisted / cancelled behind payment review", () => {
    expect(orderDisplayStatus("waitlisted", ["awaiting_payment"])).toBe("waitlisted");
    expect(orderDisplayStatus("cancelled", ["pending_verification"])).toBe("cancelled");
  });
});
