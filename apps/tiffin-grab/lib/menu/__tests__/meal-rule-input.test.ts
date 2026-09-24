import { describe, expect, it } from "vitest";
import { assertValidRuleInput, valueKindFor, type RuleInput } from "../meal-rule-input";

function input(over: Partial<RuleInput> = {}): RuleInput {
  return {
    name: "One non-veg sabzi",
    matchMode: "all",
    action: "max_qualifying",
    actionValue: 1,
    conditions: [{ field: "category", operator: "is", valueKeys: ["sabzi"] }],
    ...over,
  };
}

const fails = (over: Partial<RuleInput>, match: RegExp) =>
  expect(() => assertValidRuleInput(input(over))).toThrow(match);

describe("rule name and action", () => {
  it("accepts a well-formed rule", () => {
    expect(() => assertValidRuleInput(input())).not.toThrow();
  });

  it("requires a name", () => {
    fails({ name: "   " }, /name/i);
  });

  it("requires a maximum for the maximum action", () => {
    fails({ action: "max_qualifying", actionValue: null }, /maximum/i);
    fails({ action: "max_qualifying", actionValue: 1.5 }, /maximum/i);
    fails({ action: "max_qualifying", actionValue: -1 }, /maximum/i);
  });

  it("does not require a value for actions that take none", () => {
    expect(() => assertValidRuleInput(input({ action: "forbid", actionValue: null }))).not.toThrow();
    expect(() => assertValidRuleInput(input({ action: "cannot_coexist", actionValue: null }))).not.toThrow();
  });

  it("rejects an unknown action or match mode", () => {
    fails({ action: "delete_everything" as never }, /action/i);
    fails({ matchMode: "sometimes" as never }, /all or any/i);
  });
});

describe("conditions", () => {
  it("requires at least one — a rule with none would silently do nothing", () => {
    fails({ conditions: [] }, /at least one condition/i);
  });

  it("rejects an operator that is illegal for the field", () => {
    // This is the pair the engine refuses to evaluate, so it must not be storable.
    fails(
      { conditions: [{ field: "category", operator: "contains", valueKeys: ["sabzi"] }] },
      /cannot be used with Category/i,
    );
    fails(
      { conditions: [{ field: "dish_name", operator: "is_one_of", valueText: "Paneer" }] },
      /cannot be used with Dish name/i,
    );
  });

  it("requires a value of the right kind for each field", () => {
    fails({ conditions: [{ field: "category", operator: "is", valueKeys: [] }] }, /choose a value/i);
    fails({ conditions: [{ field: "dish", operator: "is", valuePublicIds: [] }] }, /choose a value/i);
    fails({ conditions: [{ field: "dish_name", operator: "contains", valueText: "  " }] }, /enter some text/i);
  });

  it("rejects a value stored in the wrong column for its field", () => {
    fails(
      { conditions: [{ field: "category", operator: "is", valueKeys: ["sabzi"], valuePublicIds: ["dsh_1"] }] },
      /unexpected value/i,
    );
    fails(
      { conditions: [{ field: "dish_name", operator: "contains", valueText: "Paneer", valueKeys: ["sabzi"] }] },
      /unexpected value/i,
    );
  });

  it("holds `is` to a single value and allows several for `is one of`", () => {
    fails(
      { conditions: [{ field: "dish", operator: "is", valuePublicIds: ["dsh_1", "dsh_2"] }] },
      /takes one value/i,
    );
    expect(() =>
      assertValidRuleInput(input({ conditions: [{ field: "dish", operator: "is_one_of", valuePublicIds: ["dsh_1", "dsh_2"] }] })),
    ).not.toThrow();
  });

  it("rejects duplicate values", () => {
    fails({ conditions: [{ field: "dish", operator: "is_one_of", valuePublicIds: ["dsh_1", "dsh_1"] }] }, /duplicate/i);
  });

  it("caps how many conditions one rule can have", () => {
    const many = Array.from({ length: 11 }, () => ({
      field: "category" as const, operator: "is" as const, valueKeys: ["sabzi"],
    }));
    fails({ conditions: many }, /too many conditions/i);
  });
});

describe("value kinds", () => {
  it("maps each field to exactly one value column", () => {
    expect(valueKindFor("category")).toBe("keys");
    expect(valueKindFor("dish_name")).toBe("text");
    expect(valueKindFor("dish")).toBe("ids");
    expect(valueKindFor("dish_plan")).toBe("ids");
  });
});
