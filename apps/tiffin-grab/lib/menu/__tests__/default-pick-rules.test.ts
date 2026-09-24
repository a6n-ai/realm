import { describe, expect, it } from "vitest";
import { keepDefaultsWithinRules } from "../default-pick";
import type { MealRule } from "../meal-rule-types";

// Prod "Test1": at most 1 dish whose name contains "Chicken".
const chickenCap: MealRule = {
  publicId: "t1", matchMode: "any", action: "max_qualifying", actionValue: 1, priority: 0,
  conditions: [{ field: "dish_name", operator: "contains", valueText: "Chicken" }],
};

const item = (id: number, name: string) => ({ dishId: BigInt(id), name, planId: 1n, publicId: `d${id}` });
const chickenCurry = item(1, "Chicken Curry");
const chickenKorma = item(2, "Chicken Korma");
const paneer = item(3, "Paneer Makhani");
const menu = { sabzi: [chickenKorma, paneer, chickenCurry] } as Record<string, ReturnType<typeof item>[]>;

const pick = (it: ReturnType<typeof item>, isDefaulted: boolean) => ({ dishId: it.dishId, dishPublicId: it.publicId, name: it.name, isDefaulted });
const sabzi = (...picks: ReturnType<typeof pick>[]) => [{ category: "sabzi", picks }];
const names = (r: { picks: { name: string }[] }[]) => r[0]!.picks.map((p) => p.name);

describe("keepDefaultsWithinRules", () => {
  it("moves a default that would be the second Chicken dish to the first dish that passes", () => {
    const r = keepDefaultsWithinRules(sabzi(pick(chickenCurry, false), pick(chickenKorma, true)), (c) => menu[c] ?? [], [chickenCap]);
    expect(names(r)).toEqual(["Chicken Curry", "Paneer Makhani"]);
    expect(r[0]!.picks[1]!.isDefaulted).toBe(true);
  });

  it("never changes the customer's own pick", () => {
    const r = keepDefaultsWithinRules(sabzi(pick(chickenCurry, false), pick(chickenKorma, false)), (c) => menu[c] ?? [], [chickenCap]);
    expect(names(r)).toEqual(["Chicken Curry", "Chicken Korma"]);
  });

  it("keeps a default that already passes", () => {
    const r = keepDefaultsWithinRules(sabzi(pick(paneer, false), pick(chickenKorma, true)), (c) => menu[c] ?? [], [chickenCap]);
    expect(names(r)).toEqual(["Paneer Makhani", "Chicken Korma"]);
  });

  it("keeps the default when no menu dish passes, rather than leaving the slot empty", () => {
    const r = keepDefaultsWithinRules(sabzi(pick(chickenCurry, false), pick(chickenKorma, true)), () => [chickenKorma, chickenCurry], [chickenCap]);
    expect(names(r)).toEqual(["Chicken Curry", "Chicken Korma"]);
  });

  it("two defaults: only the second is moved", () => {
    const r = keepDefaultsWithinRules(sabzi(pick(chickenKorma, true), pick(chickenKorma, true)), (c) => menu[c] ?? [], [chickenCap]);
    expect(names(r)).toEqual(["Chicken Korma", "Paneer Makhani"]);
  });
});
