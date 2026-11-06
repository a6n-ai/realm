import { describe, expect, it } from "vitest";
import { pillVisible } from "../pill-visible";

describe("pillVisible", () => {
  it("shows on every public page, the refer pages included", () => {
    for (const p of ["/", "/menu/weekly", "/refer", "/refer/K7M2QX", "/plans", "/subscribers"]) expect(pillVisible(p)).toBe(true);
  });
  it("hides in the order flow, which has its own bottom bar", () => {
    for (const p of ["/subscribe", "/subscribe/checkout"]) expect(pillVisible(p)).toBe(false);
  });
});
