import { describe, expect, test } from "vitest";
import { expiryFrom } from "../expiry";

describe("expiryFrom", () => {
  const now = Date.UTC(2026, 10, 28, 12);

  test("presets add their seconds", () => {
    expect(expiryFrom({ preset: 3600 }, now)).toBe(now + 3_600_000);
  });

  test("a date expires at the end of that local day", () => {
    const at = new Date(expiryFrom({ date: "2026-12-01" }, now));
    expect([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()]).toEqual([2026, 11, 1, 23, 59]);
  });

  test("a missing or malformed date is NaN, which the server refuses", () => {
    expect(expiryFrom({ date: "" }, now)).toBeNaN();
  });
});
