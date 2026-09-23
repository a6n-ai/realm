import { describe, expect, it } from "vitest";
import { validateMealRules } from "../meal-validation";
import { generateDescription, ruleText } from "../meal-rule-text";
import type { HydratedPick, MealRule } from "../meal-rule-types";

const NONVEG = 9n;
const VEG = 8n;

const dish = (id: bigint, name: string, planId: bigint, category: string): HydratedPick => ({
  dishId: id,
  dishName: name,
  dishPlanId: planId,
  category,
});

const chicken = dish(101n, "Chicken Curry", NONVEG, "sabzi");
const butterChicken = dish(102n, "Butter Chicken", NONVEG, "sabzi");
const paneerButter = dish(103n, "Paneer Butter Masala", VEG, "sabzi");
const shahiPaneer = dish(104n, "Shahi Paneer", VEG, "sabzi");
const aloo = dish(201n, "Aloo Gobi", VEG, "sabzi");
const rice = dish(301n, "Jeera Rice", VEG, "rice");

function rule(over: Partial<MealRule>): MealRule {
  return {
    publicId: "mlr_x",
    matchMode: "all",
    action: "max_qualifying",
    actionValue: 1,
    priority: 0,
    conditions: [],
    ...over,
  };
}

describe("example 1 — Diet + Category, maximum", () => {
  const r = rule({
    conditions: [
      { field: "dish_plan", operator: "is", valueIds: [NONVEG] },
      { field: "category", operator: "is", valueKeys: ["sabzi"] },
    ],
  });

  it("allows one non-veg sabzi alongside veg ones", () => {
    expect(validateMealRules({ rules: [r], picks: [chicken, aloo] }).ok).toBe(true);
  });

  it("refuses two non-veg sabzi", () => {
    expect(validateMealRules({ rules: [r], picks: [chicken, butterChicken] }).ok).toBe(false);
  });

  it("ignores a non-veg dish in another category", () => {
    const nonVegRice = dish(302n, "Chicken Biryani", NONVEG, "rice");
    expect(validateMealRules({ rules: [r], picks: [chicken, nonVegRice] }).ok).toBe(true);
  });
});

describe("example 2 — Dish is one of, cannot coexist", () => {
  const r = rule({
    action: "cannot_coexist",
    actionValue: null,
    conditions: [{ field: "dish", operator: "is_one_of", valueIds: [103n, 104n] }],
  });

  it("refuses the two named dishes together", () => {
    expect(validateMealRules({ rules: [r], picks: [paneerButter, shahiPaneer] }).ok).toBe(false);
  });

  it("allows either one on its own", () => {
    expect(validateMealRules({ rules: [r], picks: [paneerButter, aloo] }).ok).toBe(true);
  });

  it("allows the SAME dish picked twice — that is a quantity question, not coexistence", () => {
    expect(validateMealRules({ rules: [r], picks: [paneerButter, paneerButter] }).ok).toBe(true);
  });
});

describe("example 3 — Dish name contains", () => {
  const r = rule({
    conditions: [{ field: "dish_name", operator: "contains", valueText: "Paneer" }],
  });

  it("counts every dish whose name contains the word, across categories", () => {
    expect(validateMealRules({ rules: [r], picks: [paneerButter, shahiPaneer] }).ok).toBe(false);
    expect(validateMealRules({ rules: [r], picks: [paneerButter, aloo] }).ok).toBe(true);
  });

  it("matches case-insensitively", () => {
    const lower = dish(105n, "kadai paneer", VEG, "sabzi");
    expect(validateMealRules({ rules: [r], picks: [lower, paneerButter] }).ok).toBe(false);
  });
});

describe("operators", () => {
  it("is_not matches per pick, not per meal", () => {
    // "at most 1 non-veg sabzi" written the other way round.
    const r = rule({
      conditions: [
        { field: "dish_plan", operator: "is_not", valueIds: [VEG] },
        { field: "category", operator: "is", valueKeys: ["sabzi"] },
      ],
    });
    expect(validateMealRules({ rules: [r], picks: [chicken, aloo] }).ok).toBe(true);
    expect(validateMealRules({ rules: [r], picks: [chicken, butterChicken] }).ok).toBe(false);
  });

  it("any (OR) matches a pick satisfying either condition", () => {
    const r = rule({
      matchMode: "any",
      actionValue: 1,
      conditions: [
        { field: "category", operator: "is", valueKeys: ["rice"] },
        { field: "dish_plan", operator: "is", valueIds: [NONVEG] },
      ],
    });
    // rice + chicken = two matches > 1.
    expect(validateMealRules({ rules: [r], picks: [rice, chicken] }).ok).toBe(false);
    expect(validateMealRules({ rules: [r], picks: [rice, aloo] }).ok).toBe(true);
  });

  it("forbid refuses any match at all", () => {
    const r = rule({
      action: "forbid",
      actionValue: null,
      conditions: [{ field: "dish_plan", operator: "is", valueIds: [NONVEG] }],
    });
    expect(validateMealRules({ rules: [r], picks: [aloo] }).ok).toBe(true);
    expect(validateMealRules({ rules: [r], picks: [chicken] }).ok).toBe(false);
  });
});

describe("safety", () => {
  it("a rule with no conditions never matches, rather than blocking everything", () => {
    const r = rule({ conditions: [] });
    expect(validateMealRules({ rules: [r], picks: [chicken, butterChicken] }).ok).toBe(true);
  });

  it("a condition whose values are gone (deleted dish/plan) degrades to no match", () => {
    const r = rule({ conditions: [{ field: "dish", operator: "is_one_of", valueIds: [] }] });
    expect(validateMealRules({ rules: [r], picks: [chicken, butterChicken] }).ok).toBe(true);
  });

  it("names the violated rule so the picker can highlight it", () => {
    const a = rule({
      publicId: "mlr_a",
      priority: 0,
      conditions: [{ field: "category", operator: "is", valueKeys: ["sabzi"] }],
      actionValue: 10,
    });
    const b = rule({
      publicId: "mlr_b",
      priority: 5,
      conditions: [{ field: "dish_plan", operator: "is", valueIds: [NONVEG] }],
      actionValue: 1,
    });
    const res = validateMealRules({ rules: [a, b], picks: [chicken, butterChicken] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.rulePublicId).toBe("mlr_b");
  });
});

describe("customer-facing text", () => {
  const labels = {
    category: { sabzi: "Sabzi" },
    plan: { "9": "Non-Veg" },
    dish: { "103": "Paneer Butter Masala", "104": "Shahi Paneer" },
  };

  it("generates a sentence for Diet + Category + maximum", () => {
    const r = rule({
      conditions: [
        { field: "dish_plan", operator: "is", valueIds: [NONVEG] },
        { field: "category", operator: "is", valueKeys: ["sabzi"] },
      ],
    });
    expect(generateDescription(r, labels)).toBe("You can choose at most 1 Non-Veg Sabzi in this meal.");
  });

  it("generates a sentence for cannot-coexist over named dishes", () => {
    const r = rule({
      action: "cannot_coexist",
      conditions: [{ field: "dish", operator: "is_one_of", valueIds: [103n, 104n] }],
    });
    expect(generateDescription(r, labels)).toMatch(/only one of: Paneer Butter Masala or Shahi Paneer/);
  });

  it("prefers the admin's own wording when there is any", () => {
    const r = rule({
      description: "Only one butter-based curry per tiffin, please.",
      conditions: [{ field: "category", operator: "is", valueKeys: ["sabzi"] }],
    });
    expect(ruleText(r, labels)).toBe("Only one butter-based curry per tiffin, please.");
  });

  it("falls back to an honest vague line rather than emitting unreadable English", () => {
    const r = rule({
      matchMode: "any",
      conditions: [
        { field: "category", operator: "is", valueKeys: ["sabzi"] },
        { field: "dish_name", operator: "contains", valueText: "Paneer" },
      ],
    });
    // This is the signal to an admin that the rule needs a written description.
    expect(generateDescription(r, labels)).toBe("Some dishes are limited in this meal.");
  });
});

describe("scope and enablement are the service's job, not the engine's", () => {
  // The engine only ever sees rules the service already scoped and filtered, so
  // these assert the CONTRACT: whatever is handed in is evaluated, nothing else.
  it("evaluates exactly the rules it is given", () => {
    const r = rule({ conditions: [{ field: "dish_plan", operator: "is", valueIds: [NONVEG] }] });
    expect(validateMealRules({ rules: [], picks: [chicken, butterChicken] }).ok).toBe(true);
    expect(validateMealRules({ rules: [r], picks: [chicken, butterChicken] }).ok).toBe(false);
  });

  it("applies every rule given, failing on the first breach", () => {
    const sabziMax = rule({
      publicId: "mlr_sabzi",
      conditions: [{ field: "category", operator: "is", valueKeys: ["sabzi"] }],
      actionValue: 5,
    });
    const nonVegMax = rule({
      publicId: "mlr_nonveg",
      conditions: [{ field: "dish_plan", operator: "is", valueIds: [NONVEG] }],
      actionValue: 1,
    });
    const res = validateMealRules({ rules: [sabziMax, nonVegMax], picks: [chicken, butterChicken, aloo] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.rulePublicId).toBe("mlr_nonveg");
  });
});

describe("an already-broken meal does not trap the customer", () => {
  // A rule added AFTER the picks were made (or picks predating it) leaves a meal
  // that breaks the rule. Whole-meal evaluation must not then refuse every later
  // edit, including edits to categories the rule says nothing about.
  const nonVegSabzi = rule({
    conditions: [
      { field: "dish_plan", operator: "is", valueIds: [NONVEG] },
      { field: "category", operator: "is", valueKeys: ["sabzi"] },
    ],
    actionValue: 1,
  });
  const broken = [chicken, butterChicken];

  it("allows editing an unrelated category while the breach stands", () => {
    const res = validateMealRules({ rules: [nonVegSabzi], picks: [...broken, rice], focus: rice });
    expect(res.ok).toBe(true);
  });

  it("still refuses an edit that adds to the breach", () => {
    const third = dish(106n, "Mutton Curry", NONVEG, "sabzi");
    const res = validateMealRules({ rules: [nonVegSabzi], picks: [...broken, third], focus: third });
    expect(res.ok).toBe(false);
  });

  it("lets the customer fix the offending category", () => {
    // Swapping one non-veg sabzi for a veg one brings the meal back inside the rule.
    const res = validateMealRules({ rules: [nonVegSabzi], picks: [chicken, aloo], focus: aloo });
    expect(res.ok).toBe(true);
  });

  it("without a focus pick, the whole meal is judged on its own terms", () => {
    expect(validateMealRules({ rules: [nonVegSabzi], picks: broken }).ok).toBe(false);
  });
});

describe("malformed conditions cannot crash or silently mean something else", () => {
  it("an operator that is illegal for its field never matches", () => {
    // `category contains "sabzi"` must not quietly behave like `category is`.
    const r = rule({
      conditions: [{ field: "category", operator: "contains", valueKeys: ["sabzi"], valueText: "sabzi" }],
    });
    expect(validateMealRules({ rules: [r], picks: [chicken, butterChicken] }).ok).toBe(true);
  });

  it("null and empty values degrade to no match", () => {
    for (const c of [
      { field: "dish_plan" as const, operator: "is" as const, valueIds: null },
      { field: "category" as const, operator: "is" as const, valueKeys: null },
      { field: "dish_name" as const, operator: "contains" as const, valueText: null },
      { field: "dish_name" as const, operator: "contains" as const, valueText: "   " },
    ]) {
      expect(validateMealRules({ rules: [rule({ conditions: [c] })], picks: [chicken, butterChicken] }).ok).toBe(true);
    }
  });

  it("is_not on an empty value set does not match everything", () => {
    // Otherwise a rule whose dish was deleted would suddenly forbid every pick.
    const r = rule({
      action: "forbid",
      conditions: [{ field: "dish_plan", operator: "is_not", valueIds: [] }],
    });
    expect(validateMealRules({ rules: [r], picks: [chicken] }).ok).toBe(true);
  });

  it("an empty meal satisfies a maximum rule rather than failing it", () => {
    const r = rule({ conditions: [{ field: "dish_plan", operator: "is_not", valueIds: [VEG] }] });
    expect(validateMealRules({ rules: [r], picks: [] }).ok).toBe(true);
  });
});
