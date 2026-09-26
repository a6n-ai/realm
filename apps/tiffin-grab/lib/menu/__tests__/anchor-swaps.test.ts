import { describe, expect, it } from "vitest";
import type { GridCell } from "../meals-grid";
import { anchorSwaps, groupPickCells, type AnchoredSwap } from "../pick-groups";

const cat = (key: string, selectable: boolean, sortOrder: number) => ({ key, label: key, selectable, sortOrder });
const categories = [cat("sabzi", true, 0), cat("daal", false, 1)];
const cell = (slot: string, pickIndex: number, selectable: boolean): GridCell => ({
  day: "mon", dateIso: "2026-09-30", slot, personIndex: 1, pickIndex, selectable, quantity: 1,
  selectedDishId: null, isDefaulted: true, dishes: [], locked: false, lockNote: null,
} as GridCell);
const swap = (publicId: string): AnchoredSwap => ({
  publicId, fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1, pending: true,
});

// Maharaja Thali: Sabzi 12oz, Daal 12oz, Sabzi 8oz.
const basePortions = { sabzi: ["12oz", "8oz"], daal: ["12oz"] };

describe("anchorSwaps", () => {
  it("keeps Sabzi 12oz → Daal in the Sabzi section and takes the received Daal out of Daal", () => {
    // After the swap the grid holds Sabzi [8oz] and Daal [12oz, 12oz(received)].
    const groups = groupPickCells(
      [cell("sabzi", 1, true), cell("daal", 1, false), cell("daal", 2, false)],
      categories,
      { sabzi: ["8oz"], daal: ["12oz", "12oz"] },
    );
    const [sabzi, daal] = anchorSwaps({ groups, swaps: [swap("a")], categories, basePortions, amounts: () => null });

    expect(sabzi!.swapped.map((r) => [r.givePortion, r.getPortion])).toEqual([["12oz", "12oz"]]);
    expect(sabzi!.cells.map((c) => c.pickIndex)).toEqual([1]);
    expect(daal!.cells.map((c) => c.pickIndex)).toEqual([1]);
    expect(daal!.portions).toEqual(["12oz"]);
  });

  it("keeps a category whose every row was swapped away, in order", () => {
    const groups = groupPickCells(
      [cell("daal", 1, false), cell("daal", 2, false), cell("daal", 3, false)],
      categories,
      { daal: ["12oz", "12oz", "8oz"] },
    );
    const [sabzi, daal] = anchorSwaps({ groups, swaps: [swap("a"), swap("b")], categories, basePortions, amounts: () => null });

    expect(sabzi!.key).toBe("sabzi");
    expect(sabzi!.cells).toHaveLength(0);
    expect(sabzi!.swapped.map((r) => [r.swap.publicId, r.givePortion, r.getPortion])).toEqual([
      ["a", "12oz", "12oz"],
      ["b", "8oz", "8oz"],
    ]);
    expect(daal!.cells.map((c) => c.pickIndex)).toEqual([1]);
  });
});
