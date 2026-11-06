import { describe, expect, it } from "vitest";
import { pillVisible } from "../pill-visible";

describe("pillVisible", () => {
  it("shows on browsing pages", () => {
    expect(pillVisible("/")).toBe(true);
    expect(pillVisible("/menu/weekly")).toBe(true);
    expect(pillVisible("/referrals-faq")).toBe(true);
  });
  it("hides where ordering or referring already fills the screen", () => {
    for (const p of ["/subscribe", "/subscribe/checkout", "/refer", "/refer/K7M2QX"]) expect(pillVisible(p)).toBe(false);
  });
});
