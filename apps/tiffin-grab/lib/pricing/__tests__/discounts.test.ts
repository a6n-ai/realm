import { describe, expect, it } from "vitest";
import { applicableRules, postCatalogSubtotal, savePct, type AppDiscountRule } from "../discounts";

const rule = (key: string, kind: string, percent: number, over: Partial<AppDiscountRule> = {}): AppDiscountRule => ({ key, kind, percent, targetKey: null, minWeeks: null, ...over });

describe("applicableRules", () => {
  const ctx = { targets: { delivery: "f1", duration: "d1" }, weeks: 4 };
  it("filters by target and minWeeks", () => {
    const rules = [rule("all", "delivery", 5), rule("mine", "delivery", 5, { targetKey: "f1" }), rule("other", "delivery", 5, { targetKey: "f2" }), rule("long", "duration", 5, { minWeeks: 8 }), rule("ok", "duration", 5, { minWeeks: 4 })];
    expect(applicableRules(rules, ctx).map((r) => r.key)).toEqual(["all", "mine", "ok"]);
  });
});

describe("savePct", () => {
  const ds = [{ kind: "delivery", targetPublicId: null, percent: 20, minWeeks: null }, { kind: "delivery", targetPublicId: "f", percent: 15, minWeeks: null }];
  it("uncapped by default, clamped to maxPct", () => {
    expect(savePct(ds, "delivery", "f")).toBe(35);
    expect(savePct(ds, "delivery", "f", 0, 25)).toBe(25);
  });
});

describe("postCatalogSubtotal", () => {
  it("is subtotal minus catalog lines, floored at 0", () => {
    expect(postCatalogSubtotal(100, [{ amount: 25 }])).toBe(75);
    expect(postCatalogSubtotal(100, [{ amount: 150 }])).toBe(0);
  });
});
