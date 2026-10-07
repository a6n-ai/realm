import { describe, expect, it } from "vitest";
import type { GridCell, GridDish } from "../meals-grid";
import { foldProvisionalCells } from "../pick-preview";

const D = "2026-10-08";
const dish = (id: string, name: string): GridDish => ({ id, name, image: null });
const sabzi = [dish("pg", "Patta Gobhi"), dish("cm", "Chana Masala")];
const cell = (pickIndex: number): GridCell => ({
  day: "thu", dateIso: D, slot: "sabzi", personIndex: 1, pickIndex, selectable: true, quantity: 1,
  selectedDishId: "pg", isDefaulted: true, dishes: sabzi, locked: false,
});
const base = { items: [{ category: "sabzi", tuAmount: "12", sortOrder: 1 }, { category: "sabzi", tuAmount: "12", sortOrder: 2 }], tu: [], appliedByDate: {} };
const swap = { fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1, fromRow: null, forDate: D };

describe("foldProvisionalCells", () => {
  it("a swap into a category the meal lacks takes that day's menu for it, not the source row's dishes", () => {
    const out = foldProvisionalCells({
      cells: [cell(1), cell(2)],
      categories: [{ key: "sabzi", selectable: true }, { key: "daal", selectable: false }],
      base,
      provisional: [swap],
      menu: { [D]: { daal: [dish("cd", "Chana Dal")] } },
    });
    const daal = out.filter((c) => c.slot === "daal");
    expect(daal).toHaveLength(1);
    expect(daal[0]!.dishes.map((d) => d.name)).toEqual(["Chana Dal"]);
    // Fixed destination: its one dish is named, so the row and summary show it.
    expect(daal[0]!.selectedDishId).toBe("cd");
    expect(out.filter((c) => c.slot === "sabzi")).toHaveLength(1);
  });

  it("without a menu for the destination, the new row has no dishes rather than the source's", () => {
    const out = foldProvisionalCells({
      cells: [cell(1), cell(2)],
      categories: [{ key: "sabzi", selectable: true }, { key: "daal", selectable: true }],
      base,
      provisional: [swap],
    });
    expect(out.find((c) => c.slot === "daal")!.dishes).toEqual([]);
  });
});
