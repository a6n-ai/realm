import { describe, expect, it } from "vitest";
import { SERVICE_WINDOW_MS, isInsideServiceWindow, requiresTemplate } from "./window";

const HOUR = 3_600_000;

describe("isInsideServiceWindow", () => {
  it("is a 24-hour window", () => {
    expect(SERVICE_WINDOW_MS).toBe(24 * HOUR);
  });

  it("is inside just before 24 hours", () => {
    expect(isInsideServiceWindow(0, 24 * HOUR - 1)).toBe(true);
  });

  it("is outside at exactly 24 hours", () => {
    expect(isInsideServiceWindow(0, 24 * HOUR)).toBe(false);
  });

  it("is outside when there was never an inbound message", () => {
    expect(isInsideServiceWindow(null, 0)).toBe(false);
  });
});

describe("requiresTemplate", () => {
  it("requires a template with no recent inbound message", () => {
    expect(requiresTemplate(null, 0)).toBe(true);
  });

  it("allows free-form inside the window", () => {
    expect(requiresTemplate(0, HOUR)).toBe(false);
  });

  it("requires a template again once the window closes", () => {
    expect(requiresTemplate(0, 25 * HOUR)).toBe(true);
  });
});
