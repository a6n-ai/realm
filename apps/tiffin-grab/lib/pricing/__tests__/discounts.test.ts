import { describe, expect, it } from "vitest";
import { applicableRules, postCatalogSubtotal, resolveCatalogDiscounts, savePct, type DiscountRule } from "../discounts";

const rule = (key: string, kind: string, percent: number, over: Partial<DiscountRule> = {}): DiscountRule => ({ key, kind, percent, targetKey: null, minWeeks: null, ...over });

describe("resolveCatalogDiscounts", () => {
  it("single discount", () => {
    const r = resolveCatalogDiscounts([rule("a", "delivery", 10)], { tiffinSubtotal: 60, maxDiscountPct: 25 });
    expect(r.lines.map((l) => l.amount)).toEqual([6]);
    expect(r.capped).toBe(false);
  });
  it("adds up", () => {
    const r = resolveCatalogDiscounts([rule("a", "delivery", 10), rule("b", "duration", 5)], { tiffinSubtotal: 200, maxDiscountPct: 25 });
    expect(r.lines.map((l) => l.amount)).toEqual([20, 10]);
    expect(r.totalPercent).toBe(15);
  });
  it("caps and scales so lines sum exactly to the cap", () => {
    const r = resolveCatalogDiscounts([rule("a", "delivery", 10), rule("b", "duration", 20)], { tiffinSubtotal: 99.99, maxDiscountPct: 25 });
    expect(r.capped).toBe(true);
    expect(r.totalPercent).toBe(25);
    expect(Math.round(r.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100).toBe(25);
  });
  it("no rules", () => {
    expect(resolveCatalogDiscounts([], { tiffinSubtotal: 50, maxDiscountPct: 25 }).lines).toEqual([]);
  });
});

describe("applicableRules", () => {
  const ctx = { targets: { delivery: "f1", duration: "d1" }, weeks: 4 };
  it("filters by target and minWeeks", () => {
    const rules = [rule("all", "delivery", 5), rule("mine", "delivery", 5, { targetKey: "f1" }), rule("other", "delivery", 5, { targetKey: "f2" }), rule("long", "duration", 5, { minWeeks: 8 }), rule("ok", "duration", 5, { minWeeks: 4 })];
    expect(applicableRules(rules, ctx).map((r) => r.key)).toEqual(["all", "mine", "ok"]);
  });
});

describe("rounding allocation", () => {
  it("many tiny lines after cap scaling: no negative line, exact sum", () => {
    const rules = Array.from({ length: 40 }, (_, i) => rule(`r${i}`, "delivery", 0.01 + (i % 3) * 0.01));
    for (const subtotal of [33.33, 7.77, 100, 1234.56, 0.5]) {
      const r = resolveCatalogDiscounts(rules, { tiffinSubtotal: subtotal, maxDiscountPct: 0.5 });
      expect(r.lines.every((l) => l.amount >= 0)).toBe(true);
      const total = Math.round(r.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
      expect(total).toBe(Math.round((subtotal * 0.5 + Number.EPSILON)) / 100);
    }
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
