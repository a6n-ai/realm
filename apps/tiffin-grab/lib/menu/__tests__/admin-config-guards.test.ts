import { describe, expect, it } from "vitest";
import {
  emptyActiveCompositionMessage,
  invalidMealRuleMaxMessage,
  maxTuBelowBaseMessage,
  mealRuleCategoryMessage,
  unknownPlanCategoryMessage,
} from "@/lib/menu/admin-config-guards";
import { RESOURCES } from "@/app/(dashboard)/dashboard/catalog/resource-config";

describe("admin-config-guards (Phase 8)", () => {
  it("rejects Max TU below summed base composition for a category", () => {
    expect(
      maxTuBelowBaseMessage([
        { category: "sabzi", tuAmount: "1.50", maxTuAmount: "2.00" },
        { category: "sabzi", tuAmount: "1.00", maxTuAmount: "2.00" },
      ]),
    ).toMatch(/Max TU for sabzi/);
  });

  it("accepts Max TU at or above base, and multi-row different TU", () => {
    expect(
      maxTuBelowBaseMessage([
        { category: "sabzi", tuAmount: 1.5, maxTuAmount: 2.5 },
        { category: "sabzi", tuAmount: 1.0, maxTuAmount: 2.5 },
        { category: "daal", tuAmount: 0.5 },
      ]),
    ).toBeNull();
  });

  it("Zod meal-size schema rejects non-positive TU and Max TU", () => {
    const base = {
      key: "x",
      name: "X",
      tier: "budget" as const,
      planId: "pln_test",
      kcalMin: "1",
      kcalMax: "2",
      basePrice: "10",
    };
    expect(() =>
      RESOURCES["meal-sizes"].schema.parse({
        ...base,
        items: [{ category: "sabzi", tuAmount: "0" }],
      }),
    ).toThrow();
    expect(() =>
      RESOURCES["meal-sizes"].schema.parse({
        ...base,
        items: [{ category: "sabzi", tuAmount: "-1" }],
      }),
    ).toThrow();
    expect(() =>
      RESOURCES["meal-sizes"].schema.parse({
        ...base,
        items: [{ category: "sabzi", tuAmount: "1", maxTuAmount: "0" }],
      }),
    ).toThrow();
  });

  it("exports clear Admin-facing messages", () => {
    expect(emptyActiveCompositionMessage()).toMatch(/at least one/i);
    expect(invalidMealRuleMaxMessage()).toMatch(/1 or more/i);
    expect(unknownPlanCategoryMessage("x")).toMatch(/not available/);
    expect(mealRuleCategoryMessage("x")).toMatch(/not available/);
  });
});
