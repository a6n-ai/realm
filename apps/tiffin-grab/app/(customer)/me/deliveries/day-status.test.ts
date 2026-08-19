import { describe, expect, it } from "vitest";
import { calendarLegendKey, deliveryDayStatus, DAY_STATUS_UNDERLINE_CLASS, LEGEND_MARK_CLASS } from "./day-status";

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

describe("calendar legend mapping", () => {
  it("maps internal status onto the four customer-facing legend keys", () => {
    expect(calendarLegendKey("locked")).toBe("delivered");
    expect(calendarLegendKey("scheduled")).toBe("upcoming");
    expect(calendarLegendKey("makeup")).toBe("upcoming");
    expect(calendarLegendKey("paused")).toBe("vacation");
    expect(calendarLegendKey("skipped")).toBe("onHold");
    expect(calendarLegendKey("off")).toBeNull();
  });

  it("uses the same mark color on tiles as on the legend", () => {
    expect(DAY_STATUS_UNDERLINE_CLASS.locked).toBe(LEGEND_MARK_CLASS.delivered);
    expect(DAY_STATUS_UNDERLINE_CLASS.scheduled).toBe(LEGEND_MARK_CLASS.upcoming);
    expect(DAY_STATUS_UNDERLINE_CLASS.paused).toBe(LEGEND_MARK_CLASS.vacation);
    expect(DAY_STATUS_UNDERLINE_CLASS.skipped).toBe(LEGEND_MARK_CLASS.onHold);
  });

  it("uses saturated colors so legend marks read at a glance", () => {
    expect(LEGEND_MARK_CLASS.delivered).toContain("emerald");
    expect(LEGEND_MARK_CLASS.upcoming).toContain("sky");
    expect(LEGEND_MARK_CLASS.vacation).toContain("orange");
    expect(LEGEND_MARK_CLASS.onHold).toContain("rose");
  });
});
