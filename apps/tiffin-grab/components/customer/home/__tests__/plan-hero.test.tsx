// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { hueFromKey } from "../plan-hero";

describe("hueFromKey", () => {
  it("is deterministic for a given key", () => {
    expect(hueFromKey("veg")).toBe(hueFromKey("veg"));
  });

  it("stays within 0..359", () => {
    for (const k of ["veg", "non-veg", "healthy", "", "a-very-long-plan-key-xyz"]) {
      const h = hueFromKey(k);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(359);
    }
  });

  it("distinguishes different keys", () => {
    expect(hueFromKey("veg")).not.toBe(hueFromKey("non-veg"));
  });
});
