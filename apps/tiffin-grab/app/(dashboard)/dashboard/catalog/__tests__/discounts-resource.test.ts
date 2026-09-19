import { describe, expect, it } from "vitest";
import { RESOURCES } from "../resource-config";

const s = RESOURCES.discounts.schema;
const base = { name: "Early bird", kind: "duration", percent: "5" };

describe("discounts resource", () => {
  it("is keyed and index-listed as its own entry", () => {
    expect(RESOURCES.discounts.keyed).toBe(true);
  });
  it("parses a minimal row; blank key/target/dates become undefined/null", () => {
    const out = s.parse({ ...base, key: "", targetId: "", startsAt: "", endsAt: "", minWeeks: "" }) as Record<string, unknown>;
    expect(out.key).toBeUndefined();
    expect(out.targetId).toBeNull();
    expect(out.startsAt).toBeNull();
    expect(out.minWeeks).toBeNull();
    expect(out.percent).toBe("5.00");
  });
  it("treats the 'all' sentinel as no target", () => {
    expect((s.parse({ ...base, targetId: "all" }) as { targetId: unknown }).targetId).toBeNull();
  });
  it.each(["-1", "100.5", "abc", ""])("rejects percent %s", (percent) => {
    expect(() => s.parse({ ...base, percent })).toThrow();
  });
  it.each(["0", "100"])("accepts percent bound %s", (percent) => {
    expect(() => s.parse({ ...base, percent })).not.toThrow();
  });
  it("rejects unknown kind and bad dates", () => {
    expect(() => s.parse({ ...base, kind: "coupon" })).toThrow();
    expect(() => s.parse({ ...base, startsAt: "05/01/2026" })).toThrow();
  });
  it("rejects a non-slug key and non-positive minWeeks", () => {
    expect(() => s.parse({ ...base, key: "Bad Key" })).toThrow();
    expect(() => s.parse({ ...base, minWeeks: "0" })).toThrow();
  });
});
