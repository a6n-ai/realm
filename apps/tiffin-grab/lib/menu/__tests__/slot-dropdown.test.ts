import { describe, expect, it } from "vitest";
import { computeSwapOption, type CompositionContext, type SwapOption } from "../meal-validation";
import type { SwapCategory } from "../swap-rules";
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
      fromRow: null,
      toDishId: null,
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
    // Like-for-like swaps name the destination only (the row title has the size); bundles keep their amount.
    expect(leading.map((o) => o.label)).toEqual([
      "Aloo gobi",
      "Bhindi",
      "Daal",
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
    expect(trailing[2]!.reason).toBe("Swap the sabzi above first");
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
    expect(opts.filter((o) => o.kind === "swap").map((o) => o.label)).toEqual(["Daal"]);
  });

  it("offers a swap into a category with a choice as one button per dish", () => {
    const opts = buildSlotDropdownOptions({
      cellIndexInCategory: 0,
      categoryKey: "sabzi",
      dishes: [],
      swapOptions: [sabziDaal],
      onePerRow: true,
      fromRow: 0,
      categoryLabel: (k) => k,
      destinationDishes: () => [
        { id: "p1", name: "Paneer Makhani" },
        { id: "c1", name: "Chicken Curry", disabled: true, reason: "Not allowed with your other picks" },
      ],
    });
    expect(opts.map((o) => [o.label, !!o.disabled])).toEqual([["Paneer Makhani", false], ["Chicken Curry", true]]);
    expect(parseSlotOptionValue(opts[0]!.value)).toMatchObject({ kind: "swap", toCategory: "daal", fromRow: 0, toDishId: "p1" });
  });

  it("names the dish a fixed destination brings", () => {
    const opts = buildSlotDropdownOptions({
      cellIndexInCategory: 0,
      categoryKey: "sabzi",
      dishes: [],
      swapOptions: [sabziDaal],
      onePerRow: true,
      categoryLabel: (k) => k,
      destinationName: (k) => (k === "daal" ? "Dal Tadka" : undefined),
    });
    expect(opts.map((o) => [o.label, o.reason])).toEqual([["Dal Tadka", undefined]]);
  });

  it("a later per-pick row swaps itself: live, carrying its row", () => {
    const opts = buildSlotDropdownOptions({
      cellIndexInCategory: 1,
      categoryKey: "sabzi",
      dishes: [],
      swapOptions: [sabziDaal],
      onePerRow: true,
      fromRow: 1,
      categoryLabel: (k) => (k === "daal" ? "Daal" : k),
    });
    expect(opts).toEqual([
      expect.objectContaining({ label: "Daal", fromRow: 1, value: "swap:sabzi>daal:1@1" }),
    ]);
    expect(opts[0]!.disabled).toBeFalsy();
    expect(parseSlotOptionValue(opts[0]!.value)).toEqual({ kind: "swap", fromCategory: "sabzi", toCategory: "daal", fromPicks: 1, fromRow: 1, toDishId: null });
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
    expect(opts.map((o) => [o.label, !!o.disabled, o.reason])).toEqual([
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

describe("buildSlotDropdownOptions: Muskan's side row (2026-10-08)", () => {
  it("a side row's dal is one button: its dish pick, not also a swap of the same dish", () => {
    const opts = buildSlotDropdownOptions({
      cellIndexInCategory: 1,
      categoryKey: "sabzi",
      dishes: [{ id: "moong", name: "Moong Dal" }, { id: "soya", name: "Soya Keema" }],
      swapOptions: [sabziDaal],
      onePerRow: true,
      fromRow: 1,
      categoryLabel: (k) => k,
      destinationDishes: () => [{ id: "moong", name: "Moong Dal" }],
    });
    expect(opts.filter((o) => o.label === "Moong Dal")).toHaveLength(1);
    expect(opts.find((o) => o.label === "Moong Dal")!.kind).toBe("dish");
  });

  it("a fixed dal (no dish choice) is also one button on the side row, matched by name", () => {
    const opts = buildSlotDropdownOptions({
      cellIndexInCategory: 1,
      categoryKey: "sabzi",
      dishes: [{ id: "kadhi", name: "Kadhi (Non-Veg)" }, { id: "soya", name: "Soya Keema" }],
      swapOptions: [{ ...sabziDaal, validBundles: [{ fromPicks: 1, toPicks: 1, giveNatural: "8oz", getNatural: "8oz" }] }],
      onePerRow: true,
      fromRow: 1,
      categoryLabel: (k) => k,
      destinationName: () => "Kadhi (Non-Veg)",
    });
    expect(opts.filter((o) => o.label === "Kadhi (Non-Veg)").map((o) => o.kind)).toEqual(["dish"]);
  });

  it("a sized swap into a category with a choice says it opens one: 'Any sabzi · 8oz'", () => {
    const daalSabzi: SwapOption = {
      ...sabziDaal,
      fromCategory: "daal",
      toCategory: "sabzi",
      validBundles: [{ fromPicks: 1, toPicks: 1, giveNatural: "12oz", getNatural: "8oz" }],
    };
    const opts = buildSlotDropdownOptions({
      cellIndexInCategory: 0,
      categoryKey: "daal",
      dishes: [{ id: "moong", name: "Moong Dal" }],
      swapOptions: [daalSabzi],
      onePerRow: true,
      fromRow: 0,
      categoryLabel: (k) => (k === "sabzi" ? "Sabzi" : k),
      destinationDishes: () => [{ id: "soya", name: "Soya Keema" }],
    });
    expect(opts.filter((o) => o.kind === "swap").map((o) => o.label)).toEqual([expect.stringMatching(/^Any sabzi/)]);
  });
});

describe("Edit meal: a pair with exchange overrides is decided per row", () => {
  const cat = (key: string, pickTu: number | null): SwapCategory => ({
    key, pickTu, unitType: "weight", unitLabel: "oz", maxPicksPerTiffin: null, unitSize: 8,
  });
  // 5 Item Thali Large: Sabzi 12oz + Sabzi 8oz, Daal 12oz, Rice 8oz, Roti 12oz.
  const composition: CompositionContext = {
    mealSizeItems: [
      { category: "sabzi", tuAmount: 1.5, maxTuAmount: null, sortOrder: 0 },
      { category: "daal", tuAmount: 1.5, maxTuAmount: null, sortOrder: 1 },
      { category: "sabzi", tuAmount: 1.0, maxTuAmount: null, sortOrder: 2 },
      { category: "rice", tuAmount: 1, maxTuAmount: null, sortOrder: 3 },
      { category: "roti", tuAmount: 1.5, maxTuAmount: null, sortOrder: 4 },
    ],
    baseCounts: { sabzi: 2, daal: 1, rice: 1, roti: 1 },
    categories: new Map([
      ["sabzi", cat("sabzi", 1.5)], ["daal", cat("daal", 1.5)], ["rice", cat("rice", 1)],
      ["roti", cat("roti", 1.5)], ["salad", cat("salad", null)], ["raita", cat("raita", null)],
    ]),
    labels: { sabzi: "Sabzi", salad: "Green Salad" },
  };
  const option = computeSwapOption({
    composition, applied: [], fromCategory: "sabzi", toCategory: "salad",
    overrides: [{ giveTu: 1, receiveTu: 1 }], naturalFallback: false, receivesMissing: true,
  });
  const row = (fromRow: number) =>
    buildSlotDropdownOptions({
      cellIndexInCategory: fromRow, categoryKey: "sabzi", dishes: [], swapOptions: [option],
      onePerRow: true, fromRow, categoryLabel: (k) => composition.labels![k] ?? k,
    }).filter((o) => o.kind === "swap");

  it("the 8oz row offers Salad even though the leading 12oz row has no line", () => {
    const [o] = row(1);
    expect(o).toBeDefined();
    expect(o!.disabled).toBeFalsy();
  });

  it("the 12oz row shows Salad disabled for this amount", () => {
    const [o] = row(0);
    expect(o).toMatchObject({ disabled: true, reason: "Not available for this amount" });
  });
});
