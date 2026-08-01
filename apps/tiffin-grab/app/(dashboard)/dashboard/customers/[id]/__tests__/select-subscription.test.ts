import { describe, expect, it } from "vitest";
import { selectSubscription } from "../select-subscription";

// getCustomer360 returns orders newest-first.
const ORDERS = [
  { publicId: "ord_new", status: "cancelled" },
  { publicId: "ord_live", status: "active" },
  { publicId: "ord_old", status: "completed" },
];

describe("selectSubscription", () => {
  it("defaults to the newest live subscription, not the newest order", () => {
    expect(selectSubscription(ORDERS)?.publicId).toBe("ord_live");
  });

  it("prefers a paused subscription over an older completed one", () => {
    const rows = [{ publicId: "a", status: "completed" }, { publicId: "b", status: "paused" }];
    expect(selectSubscription(rows)?.publicId).toBe("b");
  });

  it("falls back to the newest order when none are live", () => {
    const rows = [{ publicId: "a", status: "cancelled" }, { publicId: "b", status: "completed" }];
    expect(selectSubscription(rows)?.publicId).toBe("a");
  });

  it("honours an explicit ?order=", () => {
    expect(selectSubscription(ORDERS, "ord_old")?.publicId).toBe("ord_old");
  });

  it("ignores a stale ?order= for an order this customer does not own", () => {
    expect(selectSubscription(ORDERS, "ord_someone_else")?.publicId).toBe("ord_live");
  });

  it("returns null for a customer with no orders", () => {
    expect(selectSubscription([])).toBeNull();
  });
});
