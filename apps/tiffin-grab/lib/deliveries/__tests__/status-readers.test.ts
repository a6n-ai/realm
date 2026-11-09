import { describe, expect, it } from "vitest";
import { deliveryTripState } from "../status";
import { labelDeliveryStatus } from "../label-status";

const AFTER = Date.now() - 1000;

describe("the customer state and the staff label read a row differently", () => {
  it("a scheduled row the driver failed is Not delivered for the customer, but still goes out for staff", () => {
    expect(deliveryTripState({ status: "scheduled", optimoCompletionStatus: "failed" })).toBe("hold");
    expect(labelDeliveryStatus({ status: "scheduled", cutoffAt: AFTER, optimoCompletionStatus: "failed" }, Date.now())).toBe("Awaiting confirmation");
  });
  it("a held row is one state for the customer; staff split it by the driver's failure", () => {
    expect(deliveryTripState({ status: "skipped" })).toBe("hold");
    expect(deliveryTripState({ status: "skipped", optimoCompletionStatus: "failed" })).toBe("hold");
    expect(labelDeliveryStatus({ status: "skipped", cutoffAt: AFTER, optimoCompletionStatus: null }, Date.now())).toBe("On hold");
    expect(labelDeliveryStatus({ status: "skipped", cutoffAt: AFTER, optimoCompletionStatus: "failed" }, Date.now())).toBe("Not delivered");
  });
});
