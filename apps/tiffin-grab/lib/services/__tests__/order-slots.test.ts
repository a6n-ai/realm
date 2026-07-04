import { describe, expect, it } from "vitest";
import { validateOrderSlots } from "../order-slots";

describe("validateOrderSlots", () => {
  it("accepts a single offered slot for a tiffin plan", () => {
    expect(() => validateOrderSlots("tiffin", ["lunch"], ["lunch"])).not.toThrow();
  });
  it("rejects a tiffin plan with more than one chosen slot", () => {
    expect(() => validateOrderSlots("tiffin", ["lunch"], ["lunch", "dinner"])).toThrow();
  });
  it("accepts a subset of offered slots for a healthy plan", () => {
    expect(() => validateOrderSlots("healthy", ["breakfast", "lunch", "dinner"], ["breakfast", "dinner"])).not.toThrow();
  });
  it("rejects a chosen slot not in offeredSlots", () => {
    expect(() => validateOrderSlots("healthy", ["breakfast", "lunch"], ["dinner"])).toThrow();
  });
  it("rejects an empty selection", () => {
    expect(() => validateOrderSlots("healthy", ["breakfast", "lunch"], [])).toThrow();
  });
});
