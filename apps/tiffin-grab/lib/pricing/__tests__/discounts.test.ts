import { describe, expect, it } from "vitest";
import { applicableRules, hasEatingTiers, postCatalogSubtotal, savePct, type AppDiscountRule } from "../discounts";
import { mealSizeDiscountFor } from "../meal-size-discount";

const rule = (key: string, kind: string, percent: number, over: Partial<AppDiscountRule> = {}): AppDiscountRule => ({ key, kind, percent, targetKey: null, minWeeks: null, minEatingDays: null, ...over });

describe("applicableRules", () => {
  const ctx = { targets: { delivery: "f1", duration: "d1" }, weeks: 4, eatingDays: 5 };
  it("filters by target and minWeeks", () => {
    const rules = [rule("all", "delivery", 5), rule("mine", "delivery", 5, { targetKey: "f1" }), rule("other", "delivery", 5, { targetKey: "f2" }), rule("long", "duration", 5, { minWeeks: 8 }), rule("ok", "duration", 5, { minWeeks: 4 })];
    expect(applicableRules(rules, ctx).map((r) => r.key)).toEqual(["all", "mine", "ok"]);
  });
});

describe("eating-day tiers", () => {
  const tiers = [rule("t4", "delivery", 8, { targetKey: "mwf", minEatingDays: 4 }), rule("t5", "delivery", 10, { targetKey: "mwf", minEatingDays: 5 })];
  const at = (eatingDays: number, rules = tiers) => applicableRules(rules, { targets: { delivery: "mwf" }, weeks: 4, eatingDays }).map((r) => r.key);
  it("3 days gets nothing", () => expect(at(3)).toEqual([]));
  it("4 days gets the 8% tier", () => expect(at(4)).toEqual(["t4"]));
  it("5 days gets only the 10% tier, tiers do not stack", () => expect(at(5)).toEqual(["t5"]));
  it("6 and 7 days get 10%", () => { expect(at(6)).toEqual(["t5"]); expect(at(7)).toEqual(["t5"]); });
  it("an untiered row on the same target still adds", () => expect(at(5, [...tiers, rule("flat", "delivery", 2, { targetKey: "mwf" })])).toEqual(["t5", "flat"]));
  it("other targets are unaffected", () => expect(applicableRules(tiers, { targets: { delivery: "5_day" }, weeks: 4, eatingDays: 5 })).toEqual([]));
});

describe("savePct with tiers", () => {
  const ds = [{ kind: "delivery", targetPublicId: "mwf", percent: 8, minWeeks: 1, minEatingDays: 4 }, { kind: "delivery", targetPublicId: "mwf", percent: 10, minWeeks: 1, minEatingDays: 5 }];
  it("defaults to the best tier", () => expect(savePct(ds, "delivery", "mwf")).toBe(10));
  it("uses the given eating days", () => { expect(savePct(ds, "delivery", "mwf", 0, undefined, 3)).toBe(0); expect(savePct(ds, "delivery", "mwf", 0, undefined, 4)).toBe(8); });
  it("hasEatingTiers", () => { expect(hasEatingTiers(ds, "mwf")).toBe(true); expect(hasEatingTiers(ds, "5_day")).toBe(false); });
});

describe("savePct", () => {
  const ds = [{ kind: "delivery", targetPublicId: null, percent: 20, minWeeks: null }, { kind: "delivery", targetPublicId: "f", percent: 15, minWeeks: null }];
  it("uncapped by default, clamped to maxPct", () => {
    expect(savePct(ds, "delivery", "f")).toBe(35);
    expect(savePct(ds, "delivery", "f", 0, 25)).toBe(25);
  });
  it("a 1-week minimum counts before a length is picked; a longer one waits for it (prod MWF 5%, min 1 week)", () => {
    const mwf = [{ kind: "delivery", targetPublicId: "mwf", percent: 5, minWeeks: 1 }, { kind: "delivery", targetPublicId: "mwf", percent: 3, minWeeks: 8 }];
    expect(savePct(mwf, "delivery", "mwf")).toBe(5);
    expect(savePct(mwf, "delivery", "mwf", 4)).toBe(5);
    expect(savePct(mwf, "delivery", "mwf", 8)).toBe(8);
  });
});

describe("postCatalogSubtotal", () => {
  it("is subtotal minus catalog lines, floored at 0", () => {
    expect(postCatalogSubtotal(100, [{ amount: 25 }])).toBe(75);
    expect(postCatalogSubtotal(100, [{ amount: 150 }])).toBe(0);
  });
});

describe("mealSizeDiscountFor", () => {
  const rows = [
    { targetId: null, percent: 10, amount: null },
    { targetId: 2n, percent: 0, amount: 3 },
    { targetId: 2n, percent: 20, amount: null },
  ];
  it("a row aimed at the size beats an all-sizes row; lowest resulting price wins", () => {
    expect(mealSizeDiscountFor(2n, 10, rows)).toEqual({ discountType: "flat", discountValue: 3 });
    expect(mealSizeDiscountFor(2n, 20, rows)).toEqual({ discountType: "percent", discountValue: 20 });
  });
  it("falls back to all-sizes, then none", () => {
    expect(mealSizeDiscountFor(9n, 10, rows)).toEqual({ discountType: "percent", discountValue: 10 });
    expect(mealSizeDiscountFor(9n, 10, [])).toEqual({ discountType: "none", discountValue: 0 });
  });
});
