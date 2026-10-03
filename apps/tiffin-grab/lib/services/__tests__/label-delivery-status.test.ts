import { describe, expect, it } from "vitest";
import { labelDeliveryStatus } from "../daily-labels.service";

const NOW = Date.parse("2026-10-02T13:00:00Z");
const BEFORE = NOW + 60_000;
const AFTER = NOW - 60_000;

describe("labelDeliveryStatus", () => {
  it("keeps a future scheduled stop as to be delivered", () => {
    expect(labelDeliveryStatus({ status: "scheduled", cutoffAt: BEFORE, optimoCompletionStatus: null }, NOW)).toBe("To be delivered");
  });

  it("calls a past cutoff, or a driver success, delivered", () => {
    expect(labelDeliveryStatus({ status: "scheduled", cutoffAt: AFTER, optimoCompletionStatus: null }, NOW)).toBe("Delivered");
    expect(labelDeliveryStatus({ status: "scheduled", cutoffAt: BEFORE, optimoCompletionStatus: "success" }, NOW)).toBe("Delivered");
  });

  it("keeps skipped, paused, and cancelled visible under their own words", () => {
    expect(labelDeliveryStatus({ status: "skipped", cutoffAt: AFTER, optimoCompletionStatus: null }, NOW)).toBe("Not delivered");
    expect(labelDeliveryStatus({ status: "paused", cutoffAt: BEFORE, optimoCompletionStatus: null }, NOW)).toBe("Paused");
    expect(labelDeliveryStatus({ status: "cancelled", cutoffAt: AFTER, optimoCompletionStatus: null }, NOW)).toBe("Cancelled");
  });

});
