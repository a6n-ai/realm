import { describe, expect, it } from "vitest";
import type { TuCategory } from "../format-tu";
import type { GridCell } from "../meals-grid";
import { ADDON_SORT_BASE, addonRowKeys, countAddons, splitGroups } from "../pick-addons";

const D = "2026-10-08";
const roti: TuCategory = { tuUnitType: "count", tuUnitSize: 1, tuUnitLabel: "roti", selectable: false };
const base = (items: { category: string; tuAmount: string | null; sortOrder: number }[]) => ({ items, tu: [["roti", roti]] as [string, TuCategory][], appliedByDate: {} });
const cell = (slot: string, pickIndex: number, quantity = 1): GridCell => ({
  day: "thu", dateIso: D, slot, personIndex: 1, pickIndex, selectable: true, quantity, selectedDishId: "d", isDefaulted: true, dishes: [], locked: false,
});
const group = (key: string, cells: GridCell[]) => ({ key, items: cells.map((c, i) => ({ kind: "cell" as const, cell: c, index: i, row: i })) });

describe("addonRowKeys", () => {
  it("marks a category's last N one-per-row cells as add-ons", () => {
    const keys = addonRowKeys([group("sabzi", [cell("sabzi", 1), cell("sabzi", 2)])], { sabzi: 1 });
    expect([...keys]).toEqual([`${D}:sabzi:1:2`]);
  });
  it("leaves a folded count row (8 roti) to countAddons", () => {
    expect(addonRowKeys([group("roti", [cell("roti", 1, 10)])], { roti: 2 }).size).toBe(0);
  });
});

describe("countAddons", () => {
  it("splits extra roti off the meal row: meal 8 roti, add-on 2 roti", () => {
    const out = countAddons(base([
      { category: "roti", tuAmount: "8", sortOrder: 1 },
      { category: "roti", tuAmount: "1", sortOrder: ADDON_SORT_BASE },
      { category: "roti", tuAmount: "1", sortOrder: ADDON_SORT_BASE + 1 },
    ]), D, []);
    expect(out.addons).toEqual([{ category: "roti", portion: expect.stringMatching(/^2\b/) }]);
    expect(out.mealPortions.roti?.[0]).toMatch(/^8\b/);
  });
  it("no count add-ons: nothing to split", () => {
    expect(countAddons(base([{ category: "roti", tuAmount: "8", sortOrder: 1 }]), D, [])).toEqual({ addons: [], mealPortions: {} });
  });
});

describe("splitGroups", () => {
  it("cuts a category's add-on cells out of the meal, keeping portions aligned", () => {
    const sabzi = { key: "sabzi", label: "Sabzi", selectable: true, chooseCount: 2, cells: [cell("sabzi", 1), cell("sabzi", 2)], portions: ["12oz", "8oz"], dishes: [] };
    const { meal, addons } = splitGroups([sabzi], new Set([`${D}:sabzi:1:2`]));
    expect(meal[0]!.portions).toEqual(["12oz"]);
    expect(addons[0]!.portions).toEqual(["8oz"]);
    expect(addons[0]!.chooseCount).toBe(1);
  });
});
