import { describe, expect, it } from "vitest";
import { isFulfillmentReady } from "../fulfillment";

describe("isFulfillmentReady", () => {
  it("requires active + settled payment and rejects payment review", () => {
    expect(isFulfillmentReady("active", ["simulated_paid"])).toBe(true);
    expect(isFulfillmentReady("active", ["paid"])).toBe(true);
    expect(isFulfillmentReady("active", ["awaiting_payment"])).toBe(false);
    expect(isFulfillmentReady("active", ["pending_verification"])).toBe(false);
    expect(isFulfillmentReady("active", ["pending_verification", "paid"])).toBe(false);
    expect(isFulfillmentReady("active", ["rejected"])).toBe(false);
    expect(isFulfillmentReady("paused", ["paid"])).toBe(false);
    expect(isFulfillmentReady("active", [])).toBe(false);
  });
});
