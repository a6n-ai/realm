import { describe, expect, it } from "vitest";
import { resolveSelectedModifiers, type PublicModifierGroup } from "../modifiers";

// Shapes taken from the merchant's real groups.
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
  cloverModifierGroupId: "GRP_MAGGI",
  name: "Maggi",
  minRequired: null,
  maxAllowed: 2,
  showByDefault: true,
  modifiers: [
    { cloverModifierId: "M_A", name: "A", price: 0 },
    { cloverModifierId: "M_B", name: "B", price: 0 },
    { cloverModifierId: "M_C", name: "C", price: 0 },
  ],
};

describe("resolveSelectedModifiers", () => {
  it("resolves ids to catalog-priced modifiers", () => {
    const out = resolveSelectedModifiers("Sandwich", [PROTEIN, ADDONS], ["M_PANEER", "M_CHEESE"]);
    expect(out).toEqual([
      { cloverModifierId: "M_PANEER", name: "Paneer", price: 1.99 },
      { cloverModifierId: "M_CHEESE", name: "Extra Cheese", price: 0.99 },
    ]);
  });

  it("rejects a modifier the product does not offer", () => {
    expect(() => resolveSelectedModifiers("Sandwich", [ADDONS], ["M_PANEER"])).toThrow(
      /isn't available/,
    );
  });

  it("rejects an unknown id outright", () => {
    expect(() => resolveSelectedModifiers("Sandwich", [ADDONS], ["NOPE"])).toThrow(
      /isn't available/,
    );
  });

  it("requires a choice when minRequired is set", () => {
    expect(() => resolveSelectedModifiers("Sandwich", [PROTEIN], [])).toThrow(
      /Choose an option for Protein/,
    );
  });

  it("enforces maxAllowed of 1", () => {
    expect(() =>
      resolveSelectedModifiers("Sandwich", [PROTEIN], ["M_CHICKEN", "M_PANEER"]),
    ).toThrow(/Only one option/);
  });

  it("enforces a maxAllowed above 1", () => {
    expect(() => resolveSelectedModifiers("Bowl", [CAPPED], ["M_A", "M_B", "M_C"])).toThrow(
      /At most 2 options/,
    );
    expect(resolveSelectedModifiers("Bowl", [CAPPED], ["M_A", "M_B"])).toHaveLength(2);
  });

  it("rejects duplicates rather than counting them once", () => {
    expect(() => resolveSelectedModifiers("Sandwich", [ADDONS], ["M_CHEESE", "M_CHEESE"])).toThrow(
      /Duplicate/,
    );
  });

  it("allows an empty selection when nothing is required", () => {
    expect(resolveSelectedModifiers("Sandwich", [ADDONS], [])).toEqual([]);
  });

  it("allows a product with no groups at all", () => {
    expect(resolveSelectedModifiers("Plain", [], [])).toEqual([]);
  });

  // A zero-priced modifier is still a real choice the kitchen needs to see.
  it("keeps free modifiers", () => {
    const out = resolveSelectedModifiers("Sandwich", [PROTEIN], ["M_CHICKEN"]);
    expect(out).toEqual([{ cloverModifierId: "M_CHICKEN", name: "Chicken", price: 0 }]);
  });
});
