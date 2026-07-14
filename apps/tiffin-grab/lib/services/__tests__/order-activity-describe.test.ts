import { describe, expect, it } from "vitest";
import { describeActivity } from "../order-activity-describe";

describe("describeActivity", () => {
  it("labels the delivery activity types with human copy", () => {
    expect(describeActivity({ type: "skipped", note: null, fromStatus: null, toStatus: null })).toBe("Skipped");
    expect(describeActivity({ type: "unskipped", note: null, fromStatus: null, toStatus: null })).toBe("Un-skipped");
    expect(describeActivity({ type: "delivery_address_changed", note: null, fromStatus: null, toStatus: null })).toBe(
      "Delivery address changed",
    );
  });

  it("labels known activity types verbatim", () => {
    expect(describeActivity({ type: "created", note: null, fromStatus: null, toStatus: null })).toBe("Order created");
    expect(describeActivity({ type: "activated", note: null, fromStatus: null, toStatus: null })).toBe("Activated");
    expect(describeActivity({ type: "paused", note: null, fromStatus: null, toStatus: null })).toBe("Paused");
    expect(describeActivity({ type: "resumed", note: null, fromStatus: null, toStatus: null })).toBe("Resumed");
    expect(describeActivity({ type: "cancelled", note: null, fromStatus: null, toStatus: null })).toBe("Cancelled");
    expect(describeActivity({ type: "status_change", note: null, fromStatus: "active", toStatus: "paused" })).toBe(
      "Status: active → paused",
    );
  });

  it("falls back to note, then type, for unrecognized types", () => {
    expect(describeActivity({ type: "meal_pick", note: "Picked lunch", fromStatus: null, toStatus: null })).toBe(
      "Picked lunch",
    );
    expect(describeActivity({ type: "meal_pick", note: null, fromStatus: null, toStatus: null })).toBe("meal_pick");
  });
});
