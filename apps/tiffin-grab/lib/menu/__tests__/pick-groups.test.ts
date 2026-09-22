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
});
