import { describe, expect, it } from "vitest";
import { deliveryDayStatus } from "./day-status";

describe("deliveryDayStatus", () => {
  const now = 1_000_000;

  it("is scheduled for a future, un-cutoff, non-makeup delivery", () => {
    expect(deliveryDayStatus({ status: "scheduled", isMakeup: false, cutoffAt: now + 1 }, now)).toBe("scheduled");
  });

  it("is locked once the cutoff has passed, even if still 'scheduled'", () => {
    expect(deliveryDayStatus({ status: "scheduled", isMakeup: false, cutoffAt: now - 1 }, now)).toBe("locked");
  });

  it("reports paused/skipped when before cutoff", () => {
    expect(deliveryDayStatus({ status: "paused", isMakeup: false, cutoffAt: now + 1 }, now)).toBe("paused");
    expect(deliveryDayStatus({ status: "skipped", isMakeup: false, cutoffAt: now + 1 }, now)).toBe("skipped");
  });

  it("make-up overrides everything else, including a passed cutoff", () => {
    expect(deliveryDayStatus({ status: "scheduled", isMakeup: true, cutoffAt: now - 1 }, now)).toBe("makeup");
  });
});
