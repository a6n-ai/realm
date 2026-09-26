import { describe, expect, it } from "vitest";
import { formatTuHuman } from "../format-tu";
import {
  buildMealSummary,
  groupPickCells,
  portionHeaderHint,
  resolveDishTap,
  selectedProgress,
  cellKey,
} from "../pick-groups";
import type { GridCell } from "../meals-grid";

const dishes = [
  { id: "d-aloo", name: "Aloo Gobi", image: null },
  { id: "d-chicken", name: "Chicken Curry", image: null },
  { id: "d-bhindi", name: "Bhindi", image: null },
];

const cell = (o: Partial<GridCell> & Pick<GridCell, "slot" | "pickIndex">): GridCell => ({
  day: "mon",
  dateIso: "2026-09-21",
  personIndex: 1,
  selectable: true,
  quantity: 1,
  selectedDishId: "d-aloo",
  isDefaulted: true,
  dishes,
  locked: false,
  lockNote: null,
  ...o,
});

describe("groupPickCells", () => {
  it("groups two Sabzi composition rows as Choose 2 without merging TU", () => {
    const cells = [
      cell({ slot: "sabzi", pickIndex: 1 }),
      cell({ slot: "sabzi", pickIndex: 2 }),
    ];
    const groups = groupPickCells(
      cells,
      [{ key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 0 }],
      { sabzi: ["12oz", "8oz"] },
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("Sabzi");
    expect(groups[0]!.chooseCount).toBe(2);
    expect(groups[0]!.cells.map((c) => c.pickIndex)).toEqual([1, 2]);
    expect(groups[0]!.portions).toEqual(["12oz", "8oz"]);
    expect(portionHeaderHint(groups[0]!.portions)).toBe("12oz + 8oz");
  });

  it("shows Choose 3 when there are three sabzi picks", () => {
    const cells = [1, 2, 3].map((pickIndex) => cell({ slot: "sabzi", pickIndex }));
    const groups = groupPickCells(cells, [{ key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 0 }]);
    expect(groups[0]!.chooseCount).toBe(3);
  });

  it("renders multiple categories independently", () => {
    const cells = [
      cell({ slot: "sabzi", pickIndex: 1 }),
      cell({ slot: "sabzi", pickIndex: 2 }),
      cell({ slot: "daal", pickIndex: 1, dishes: [{ id: "d-dal", name: "Dal", image: null }], selectedDishId: "d-dal" }),
      cell({ slot: "roti", pickIndex: 1, selectable: false, quantity: 6, dishes: [{ id: "d-roti", name: "Roti", image: null }], selectedDishId: "d-roti" }),
    ];
    const groups = groupPickCells(
      cells,
      [
        { key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 0 },
        { key: "daal", label: "Daal", selectable: true, sortOrder: 1 },
        { key: "roti", label: "Roti", selectable: false, sortOrder: 2 },
      ],
      { sabzi: ["8oz", "8oz"], daal: ["8oz"], roti: ["1 roti"] },
    );
    expect(groups.map((g) => [g.key, g.chooseCount])).toEqual([
      ["sabzi", 2],
      ["daal", 1],
      ["roti", 6],
    ]);
  });
});

describe("natural quantity display", () => {
  it("formats 1.5 TU roti as 6 roti via formatTuHuman — never raw TU", () => {
    const label = formatTuHuman({ tuUnitType: "count", tuUnitSize: 4, tuUnitLabel: "roti" }, 1.5);
    expect(label).toBe("6 roti");
    expect(label).not.toMatch(/TU/i);
  });
});

describe("resolveDishTap / selectedProgress", () => {
  it("fills the first default pick, then the second", () => {
    const group = groupPickCells(
      [cell({ slot: "sabzi", pickIndex: 1 }), cell({ slot: "sabzi", pickIndex: 2 })],
      [{ key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 0 }],
    )[0]!;
    expect(selectedProgress(group, {})).toBe(0);
    const first = resolveDishTap(group, "d-chicken", {});
    expect(first?.cell.pickIndex).toBe(1);
    const picked = { [cellKey(first!.cell)]: "d-chicken" };
    expect(selectedProgress(group, picked)).toBe(1);
    const second = resolveDishTap(group, "d-bhindi", picked);
    expect(second?.cell.pickIndex).toBe(2);
  });
});

describe("buildMealSummary", () => {
  it("lists dishes and natural portions per category", () => {
    const groups = groupPickCells(
      [
        cell({ slot: "sabzi", pickIndex: 1, selectedDishId: "d-aloo", isDefaulted: false }),
        cell({ slot: "sabzi", pickIndex: 2, selectedDishId: "d-bhindi", isDefaulted: false }),
        cell({
          slot: "roti",
          pickIndex: 1,
          selectable: false,
          quantity: 6,
          selectedDishId: "d-roti",
          dishes: [{ id: "d-roti", name: "Roti", image: null }],
        }),
      ],
      [
        { key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 0 },
        { key: "roti", label: "Roti", selectable: false, sortOrder: 1 },
      ],
      { sabzi: ["12oz", "8oz"], roti: ["6 roti"] },
    );
    const summary = buildMealSummary(groups, {});
    expect(summary).toEqual([
      { categoryLabel: "Sabzi", lines: ["Aloo Gobi · 12oz", "Bhindi · 8oz"] },
      { categoryLabel: "Roti", lines: ["Roti · 6 roti"] },
    ]);
  });

  it("shows separate container items for multi-slot non-selectable categories (e.g. Daal 12oz + 12oz, never 24oz)", () => {
    const groups = groupPickCells(
      [
        cell({
          slot: "daal",
          pickIndex: 1,
          selectable: false,
          quantity: 2,
          selectedDishId: "d-dal",
          dishes: [{ id: "d-dal", name: "Dal Tadka", image: null }],
        }),
        cell({
          slot: "daal",
          pickIndex: 2,
          selectable: false,
          quantity: 2,
          selectedDishId: "d-dal",
          dishes: [{ id: "d-dal", name: "Dal Tadka", image: null }],
        }),
        cell({
          slot: "sabzi",
          pickIndex: 1,
          selectable: true,
          quantity: 1,
          selectedDishId: "d-paneer",
          dishes: [{ id: "d-paneer", name: "Paneer Makhani", image: null }],
        }),
      ],
      [
        { key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 0 },
        { key: "daal", label: "Daal", selectable: false, sortOrder: 1 },
      ],
      { sabzi: ["8oz"], daal: ["12oz", "12oz"] },
    );
    const summary = buildMealSummary(groups, {});
    expect(summary).toEqual([
      { categoryLabel: "Sabzi", lines: ["Paneer Makhani · 8oz"] },
      { categoryLabel: "Daal", lines: ["Dal Tadka · 12oz", "Dal Tadka · 12oz"] },
    ]);
  });

  it("shows separate container items for multi-slot Salad and Raita", () => {
    const groups = groupPickCells(
      [
        cell({
          slot: "salad",
          pickIndex: 1,
          selectable: false,
          quantity: 2,
          selectedDishId: "d-salad",
          dishes: [{ id: "d-salad", name: "Green Salad", image: null }],
        }),
        cell({
          slot: "salad",
          pickIndex: 2,
          selectable: false,
          quantity: 2,
          selectedDishId: "d-salad",
          dishes: [{ id: "d-salad", name: "Green Salad", image: null }],
        }),
      ],
      [{ key: "salad", label: "Salad", selectable: false, sortOrder: 0 }],
      { salad: ["8oz", "8oz"] },
    );
    const summary = buildMealSummary(groups, {});
    expect(summary).toEqual([
      { categoryLabel: "Salad", lines: ["Green Salad · 8oz", "Green Salad · 8oz"] },
    ]);
  });
});

/**
 * Regression tests for provisional swap cell/portion alignment.
 * The fix adjusts grid.cells to match portionsByCategory output after swaps,
 * so groupPickCells never sees a mismatch between cell count and portions.
 */
describe("provisional swap — cells + portions aligned", () => {
  const cats = [
    { key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 0 },
    { key: "daal", label: "Daal", selectable: true, sortOrder: 1 },
  ];

  // Test 1: swap X·12oz → Y·12oz, remaining X·8oz keeps its portion
  it("Test 1 — swap Sabzi·12oz → Daal·12oz leaves Sabzi·8oz intact", () => {
    // After the fix: cells are front-spliced too, so sabzi has 1 cell and daal has 2.
    const cells = [
      cell({ slot: "sabzi", pickIndex: 1 }), // remaining 8oz
      cell({ slot: "daal", pickIndex: 1, dishes: [{ id: "d-dal", name: "Dal Tadka", image: null }], selectedDishId: "d-dal" }),
      cell({ slot: "daal", pickIndex: 2, selectedDishId: null, isDefaulted: false }), // new from swap
    ];
    // portionsByCategory after swap: sabzi=["8oz"], daal=["8oz", "12oz"]
    const groups = groupPickCells(cells, cats, { sabzi: ["8oz"], daal: ["8oz", "12oz"] });
    expect(groups).toHaveLength(2);
    const sabzi = groups.find((g) => g.key === "sabzi")!;
    const daal = groups.find((g) => g.key === "daal")!;
    expect(sabzi.chooseCount).toBe(1);
    expect(sabzi.portions).toEqual(["8oz"]);
    expect(daal.chooseCount).toBe(2);
    expect(daal.portions).toEqual(["8oz", "12oz"]);
  });

  // Test 2: duplicate category — swap first X out, existing Y untouched
  it("Test 2 — swap first Sabzi·12oz → Daal, existing Daal row untouched", () => {
    const threeCats = [
      { key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 0 },
      { key: "daal", label: "Daal", selectable: true, sortOrder: 1 },
    ];
    // After swap of sabzi pick 1: sabzi has 1 cell (8oz), daal has 2 cells (8oz existing + 12oz new)
    const cells = [
      cell({ slot: "sabzi", pickIndex: 1 }), // remaining 8oz
      cell({ slot: "daal", pickIndex: 1, dishes: [{ id: "d-dal", name: "Dal Tadka", image: null }], selectedDishId: "d-dal" }),
      cell({ slot: "daal", pickIndex: 2, selectedDishId: null, isDefaulted: false }),
    ];
    const groups = groupPickCells(cells, threeCats, { sabzi: ["8oz"], daal: ["8oz", "12oz"] });
    const sabzi = groups.find((g) => g.key === "sabzi")!;
    const daal = groups.find((g) => g.key === "daal")!;
    expect(sabzi.chooseCount).toBe(1);
    expect(sabzi.portions).toEqual(["8oz"]);
    expect(daal.chooseCount).toBe(2);
    expect(daal.portions).toEqual(["8oz", "12oz"]);
    // The existing daal cell still has its selected dish
    expect(daal.cells[0]!.selectedDishId).toBe("d-dal");
  });

  // Test 3: second swap — X·8oz → Y·8oz after first swap already done
  it("Test 3 — second swap: remaining Sabzi·8oz → Daal·8oz", () => {
    // Both sabzi swapped away: sabzi has 0 cells, daal has 3 cells
    const cells = [
      cell({ slot: "daal", pickIndex: 1, dishes: [{ id: "d-dal", name: "Dal Tadka", image: null }], selectedDishId: "d-dal" }),
      cell({ slot: "daal", pickIndex: 2, selectedDishId: null, isDefaulted: false }),
      cell({ slot: "daal", pickIndex: 3, selectedDishId: null, isDefaulted: false }),
    ];
    const groups = groupPickCells(cells, cats, { daal: ["8oz", "12oz", "8oz"] });
    expect(groups).toHaveLength(1);
    const daal = groups[0]!;
    expect(daal.key).toBe("daal");
    expect(daal.chooseCount).toBe(3);
    expect(daal.portions).toEqual(["8oz", "12oz", "8oz"]);
  });

  // Test 4: 3+ composition rows retain correct category and portion
  it("Test 4 — 3+ rows: swap one middle-value out, others keep portions", () => {
    const fourCats = [
      { key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 0 },
      { key: "daal", label: "Daal", selectable: true, sortOrder: 1 },
      { key: "salad", label: "Salad", selectable: true, sortOrder: 2 },
    ];
    // Original: sabzi [16oz, 12oz, 8oz], daal [8oz], salad [4oz]
    // After swapping sabzi·16oz → daal·16oz: sabzi [12oz, 8oz], daal [8oz, 16oz], salad [4oz]
    const cells = [
      cell({ slot: "sabzi", pickIndex: 1 }), // 12oz
      cell({ slot: "sabzi", pickIndex: 2 }), // 8oz
      cell({ slot: "daal", pickIndex: 1, selectedDishId: "d-dal", dishes: [{ id: "d-dal", name: "Dal", image: null }] }),
      cell({ slot: "daal", pickIndex: 2, selectedDishId: null, isDefaulted: false }),
      cell({ slot: "salad", pickIndex: 1, selectedDishId: "d-salad", dishes: [{ id: "d-salad", name: "Salad", image: null }] }),
    ];
    const groups = groupPickCells(cells, fourCats, {
      sabzi: ["12oz", "8oz"],
      daal: ["8oz", "16oz"],
      salad: ["4oz"],
    });
    expect(groups).toHaveLength(3);
    expect(groups.find((g) => g.key === "sabzi")!.portions).toEqual(["12oz", "8oz"]);
    expect(groups.find((g) => g.key === "daal")!.portions).toEqual(["8oz", "16oz"]);
    expect(groups.find((g) => g.key === "salad")!.portions).toEqual(["4oz"]);
  });

  // Test: no portion → fallback label still works for genuine multi-pick with no TU
  it("no-portion multi-pick falls back to numbered label", () => {
    const cells = [
      cell({ slot: "sabzi", pickIndex: 1 }),
      cell({ slot: "sabzi", pickIndex: 2 }),
    ];
    const groups = groupPickCells(cells, [{ key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 0 }], {});
    expect(groups[0]!.chooseCount).toBe(2);
    // Both portions are null when no portionsBySlot — numbered fallback is correct here
    expect(groups[0]!.portions).toEqual([null, null]);
  });
});

