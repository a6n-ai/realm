import { describe, expect, it } from "vitest";
import { dishesAllowedByRules, swapOptionsAllowedByRules } from "../slot-dropdown";
import type { MealRule } from "../meal-rule-types";

const VEG = "1";
const NONVEG = "2";
const dish = (id: string, planId: string) => ({ id, name: id, image: null, ruleId: id.replace(/\D/g, ""), planId });

const paneer = dish("paneer-10", VEG);
const aloo = dish("aloo-11", VEG);
const chicken = dish("chicken-20", NONVEG);
const mutton = dish("mutton-21", NONVEG);
const sabziMenu = [paneer, aloo, chicken, mutton];

// "NonVeg curry can be taken up to 1 quantity"
const oneNonVeg: MealRule = {
  publicId: "r1",
  matchMode: "all",
  action: "max_qualifying",
  actionValue: 1,
  priority: 0,
  conditions: [{ field: "dish_plan", operator: "is", valueIds: [BigInt(NONVEG)] }],
};

const allowed = (others: { category: string; dish: typeof paneer }[], selectedId: string | null = null) =>
  dishesAllowedByRules({ rules: [oneNonVeg], category: "sabzi", dishes: sabziMenu, selectedId, others }).map((d) => d.id);

describe("dishesAllowedByRules", () => {
  it("other Sabzi is veg: every dish is offered", () => {
    expect(allowed([{ category: "sabzi", dish: paneer }])).toEqual(["paneer-10", "aloo-11", "chicken-20", "mutton-21"]);
  });

  it("other Sabzi is non-veg: non-veg dishes are hidden, veg stays", () => {
    expect(allowed([{ category: "sabzi", dish: chicken }])).toEqual(["paneer-10", "aloo-11"]);
  });

  it("keeps the current pick even when the meal already breaks the rule", () => {
    expect(allowed([{ category: "sabzi", dish: chicken }], "mutton-21")).toEqual(["paneer-10", "aloo-11", "mutton-21"]);
  });

  it("no rules: nothing is filtered", () => {
    expect(
      dishesAllowedByRules({ rules: [], category: "sabzi", dishes: sabziMenu, selectedId: null, others: [{ category: "sabzi", dish: chicken }] }),
    ).toHaveLength(4);
  });
});

describe("swapOptionsAllowedByRules", () => {
  // Prod "Test1": at most 1 dish whose name contains "Chicken".
  const chickenCap: MealRule = {
    publicId: "t1", matchMode: "any", action: "max_qualifying", actionValue: 1, priority: 0,
    conditions: [{ field: "dish_name", operator: "contains", valueText: "Chicken" }],
  };
  const curryMenu = [dish("Chicken Curry-30", NONVEG), dish("Chicken Korma-31", NONVEG)];
  const option = (fromCategory: string, toCategory: string, fromPicks: number) => ({
    fromCategory, toCategory, available: true, reason: null,
    validBundles: [{ fromPicks, toPicks: fromPicks, giveNatural: null, getNatural: null }],
    minFromPicks: fromPicks, maxFromPicks: fromPicks, bundleIncrement: null, giveNatural: null, getNatural: null,
  });
  const run = (mealPicks: { category: string; dish: typeof paneer }[]) =>
    swapOptionsAllowedByRules({
      rules: [chickenCap],
      options: [option("daal", "curry", 1)],
      mealPicks,
      menuByCategory: new Map([["curry", curryMenu], ["daal", [dish("Dal Tadka-40", VEG)]]]),
    }).map((o) => o.toCategory);

  const chickenSabzi = dish("Chicken Sabzi-22", NONVEG);
  const dal = dish("Dal Tadka-40", VEG);

  it("hides Daal → Curry when the meal already has its one Chicken dish", () => {
    expect(run([{ category: "sabzi", dish: chickenSabzi }, { category: "daal", dish: dal }])).toEqual([]);
  });

  it("offers Daal → Curry when no Chicken dish is in the meal", () => {
    expect(run([{ category: "sabzi", dish: paneer }, { category: "daal", dish: dal }])).toEqual(["curry"]);
  });

  it("giving up the Chicken dish itself frees the slot", () => {
    const r = swapOptionsAllowedByRules({
      rules: [chickenCap],
      options: [option("sabzi", "curry", 1)],
      mealPicks: [{ category: "sabzi", dish: chickenSabzi }],
      menuByCategory: new Map([["curry", curryMenu]]),
    });
    expect(r).toHaveLength(1);
  });
});
