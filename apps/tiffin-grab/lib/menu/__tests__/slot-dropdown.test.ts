import { describe, expect, it } from "vitest";
import type { SwapOption } from "../meal-validation";
import {
  buildSlotDropdownOptions,
  dishOptionValue,
  hasOutgoingSwapOptions,
  parseSlotOptionValue,
  swapOptionValue,
} from "../slot-dropdown";

const sabziDaal: SwapOption = {
  fromCategory: "sabzi",
  toCategory: "daal",
  available: true,
  reason: null,
  validBundles: [
    { fromPicks: 1, toPicks: 1, giveNatural: "12oz", getNatural: "12oz" },
    { fromPicks: 2, toPicks: 2, giveNatural: "24oz", getNatural: "24oz" },
  ],
  minFromPicks: 1,
  maxFromPicks: 2,
  bundleIncrement: 1,
  giveNatural: "12oz",
  getNatural: "12oz",
};

const dishes = [
  { id: "d1", name: "Aloo gobi" },
  { id: "d2", name: "Bhindi" },
];

describe("slot-dropdown", () => {
  it("encodes and parses dish / swap values", () => {
    expect(parseSlotOptionValue(dishOptionValue("d1"))).toEqual({ kind: "dish", dishId: "d1" });
    expect(parseSlotOptionValue(swapOptionValue("sabzi", "daal", 2))).toEqual({
      kind: "swap",
      fromCategory: "sabzi",
      toCategory: "daal",
      fromPicks: 2,
    });
    expect(parseSlotOptionValue("nope")).toBeNull();
  });

  it("puts dishes on every row; live swap bundles only on the leading row", () => {
    const leading = buildSlotDropdownOptions({
      cellIndexInCategory: 0,
      categoryKey: "sabzi",
      dishes,
      swapOptions: [sabziDaal],
      categoryLabel: (k) => (k === "daal" ? "Daal" : k),
    });
    expect(leading.map((o) => o.label)).toEqual([
      "Aloo gobi",
      "Bhindi",
      "Daal · 12oz",
      "Daal · 24oz · uses 2 items",
    ]);
    expect(leading.some((o) => o.disabled)).toBe(false);

    // Later rows still show the swap, greyed, so the row never changes shape.
    const trailing = buildSlotDropdownOptions({
      cellIndexInCategory: 2,
      categoryKey: "sabzi",
      dishes,
      swapOptions: [sabziDaal],
      categoryLabel: (k) => (k === "daal" ? "Daal" : k),
    });
    expect(trailing.map((o) => [o.label, !!o.disabled])).toEqual([
      ["Aloo gobi", false],
      ["Bhindi", false],
      ["Daal", true],
    ]);
    expect(trailing[2]!.note).toBe("Swap the sabzi above first");
  });

  it("onePerRow keeps each row to its own single-row swap", () => {
    const opts = buildSlotDropdownOptions({
      cellIndexInCategory: 0,
      categoryKey: "sabzi",
      dishes,
      swapOptions: [sabziDaal],
      onePerRow: true,
      categoryLabel: (k) => (k === "daal" ? "Daal" : k),
    });
    expect(opts.filter((o) => o.kind === "swap").map((o) => o.label)).toEqual(["Daal · 12oz"]);
  });

  it("greys out unavailable swaps, rule-blocked dishes and swaps; ignores other from-categories", () => {
    const other: SwapOption = { ...sabziDaal, fromCategory: "roti", toCategory: "rice", available: true };
    const dead: SwapOption = { ...sabziDaal, available: false, reason: "Too much Daal", validBundles: [] };
    const opts = buildSlotDropdownOptions({
      cellIndexInCategory: 0,
      categoryKey: "sabzi",
      dishes,
      disabledDishIds: new Set(["d2"]),
      swapOptions: [dead, other],
      categoryLabel: (k) => k,
    });
    expect(opts.map((o) => [o.label, !!o.disabled, o.note])).toEqual([
      ["Aloo gobi", false, undefined],
      ["Bhindi", true, "Not allowed with your other picks"],
      ["daal", true, "Too much Daal"],
    ]);

    const ruled = buildSlotDropdownOptions({
      cellIndexInCategory: 0,
      categoryKey: "sabzi",
      dishes: [],
      swapOptions: [sabziDaal],
      allowedSwaps: new Set([swapOptionValue("sabzi", "daal", 1)]),
      categoryLabel: (k) => k,
    });
    expect(ruled.map((o) => !!o.disabled)).toEqual([false, true]);
  });

  it("hasOutgoingSwapOptions follows admin pairs for any from-category", () => {
    expect(hasOutgoingSwapOptions("sabzi", [sabziDaal])).toBe(true);
    expect(hasOutgoingSwapOptions("roti", [sabziDaal])).toBe(false);
    expect(hasOutgoingSwapOptions("sabzi", [{ ...sabziDaal, available: false, validBundles: [] }])).toBe(false);
  });
});
