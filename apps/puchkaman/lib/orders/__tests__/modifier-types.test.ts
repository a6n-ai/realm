import { describe, expect, it } from "vitest";
import {
  defaultSelection,
  modifierExtraPrice,
  selectedModifiersOf,
  toggleModifier,
  unsatisfiedGroups,
  type PublicModifierGroup,
} from "../modifier-types";

const PROTEIN: PublicModifierGroup = {
  cloverModifierGroupId: "GRP_PROTEIN",
  name: "Protein",
  minRequired: 1,
  maxAllowed: 1,
  showByDefault: true,
  modifiers: [
    { cloverModifierId: "M_CHICKEN", name: "Chicken", price: 0 },
    { cloverModifierId: "M_PANEER", name: "Paneer", price: 1.99 },
  ],
};

const ADDONS: PublicModifierGroup = {
  cloverModifierGroupId: "GRP_ADDONS",
  name: "Extra Addons",
  minRequired: null,
  maxAllowed: null,
  showByDefault: true,
  modifiers: [
    { cloverModifierId: "M_CHEESE", name: "Extra Cheese", price: 0.99 },
    { cloverModifierId: "M_EGG", name: "Extra Egg", price: 1.5 },
  ],
};

const CAPPED: PublicModifierGroup = {
  ...ADDONS,
  cloverModifierGroupId: "GRP_MAGGI",
  name: "Maggi",
  maxAllowed: 2,
  modifiers: [
    { cloverModifierId: "M_A", name: "A", price: 0 },
    { cloverModifierId: "M_B", name: "B", price: 0 },
    { cloverModifierId: "M_C", name: "C", price: 0 },
  ],
};

describe("toggleModifier", () => {
  it("replaces the pick in a single-choice group", () => {
    const out = toggleModifier(PROTEIN, ["M_CHICKEN"], "M_PANEER");
    expect(out).toEqual(["M_PANEER"]);
  });

  it("leaves other groups untouched when replacing", () => {
    const out = toggleModifier(PROTEIN, ["M_CHEESE", "M_CHICKEN"], "M_PANEER");
    expect(out).toEqual(["M_CHEESE", "M_PANEER"]);
  });

  it("adds and removes freely in an uncapped group", () => {
    const added = toggleModifier(ADDONS, [], "M_CHEESE");
    expect(added).toEqual(["M_CHEESE"]);
    expect(toggleModifier(ADDONS, added, "M_CHEESE")).toEqual([]);
  });

  it("refuses to exceed maxAllowed", () => {
    const at_cap = ["M_A", "M_B"];
    expect(toggleModifier(CAPPED, at_cap, "M_C")).toEqual(at_cap);
  });

  it("still allows deselecting at the cap", () => {
    expect(toggleModifier(CAPPED, ["M_A", "M_B"], "M_A")).toEqual(["M_B"]);
  });
});

describe("unsatisfiedGroups", () => {
  it("flags a required group with nothing chosen", () => {
    expect(unsatisfiedGroups([PROTEIN, ADDONS], []).map((g) => g.name)).toEqual(["Protein"]);
  });

  it("is empty once the requirement is met", () => {
    expect(unsatisfiedGroups([PROTEIN, ADDONS], ["M_CHICKEN"])).toEqual([]);
  });

  it("never flags optional groups", () => {
    expect(unsatisfiedGroups([ADDONS], [])).toEqual([]);
  });
});

describe("pricing and selection", () => {
  it("sums the chosen modifiers", () => {
    expect(modifierExtraPrice([PROTEIN, ADDONS], ["M_PANEER", "M_CHEESE"])).toBeCloseTo(2.98, 5);
  });

  it("is zero with nothing chosen", () => {
    expect(modifierExtraPrice([PROTEIN, ADDONS], [])).toBe(0);
  });

  it("returns modifiers in group order regardless of pick order", () => {
    const out = selectedModifiersOf([PROTEIN, ADDONS], ["M_CHEESE", "M_PANEER"]);
    expect(out.map((m) => m.cloverModifierId)).toEqual(["M_PANEER", "M_CHEESE"]);
  });
});

describe("defaultSelection", () => {
  // A required group offering exactly one option has no decision to make.
  it("pre-picks a required group with a single option", () => {
    const only: PublicModifierGroup = { ...PROTEIN, modifiers: [PROTEIN.modifiers[0]] };
    expect(defaultSelection([only])).toEqual(["M_CHICKEN"]);
  });

  it("leaves a real choice to the customer", () => {
    expect(defaultSelection([PROTEIN, ADDONS])).toEqual([]);
  });
});
