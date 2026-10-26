import { describe, expect, it } from "vitest";
import { validateProposedSwap, type CompositionContext } from "../meal-validation";
import { NO_LINE_FOR_AMOUNT, swapLabel, swapPairFits, type SwapCategory } from "../swap-rules";

const oz = (key: string, pickTu: number | null, maxPicksPerTiffin: number | null = null): SwapCategory => ({
  key, pickTu, unitType: "weight", unitLabel: "oz", maxPicksPerTiffin, unitSize: 8,
});
const roti: SwapCategory = { key: "roti", pickTu: 1.5, unitType: "count", unitLabel: "roti", maxPicksPerTiffin: null, unitSize: 4 };

const item = (category: string, tuAmount: number, sortOrder: number) => ({ category, tuAmount, maxTuAmount: null, sortOrder });
const labels = { sabzi: "Sabzi", daal: "Daal", rice: "Rice", roti: "Roti", salad: "Salad", raita: "Raita" };
const sabzi: SwapCategory = { ...oz("sabzi", 1.5), rowTu: [1.5, 1] };
const salad = oz("salad", null, 2);
const raita = oz("raita", null);

// 5 Item Large: no salad or raita row.
const large: CompositionContext = {
  mealSizeItems: [item("sabzi", 1.5, 0), item("daal", 1.5, 1), item("sabzi", 1, 2), item("rice", 1, 3), item("roti", 1.5, 4)],
  baseCounts: { sabzi: 2, daal: 1, rice: 1, roti: 1 },
  categories: new Map([["sabzi", sabzi], ["daal", oz("daal", 1.5)], ["rice", oz("rice", 1)], ["roti", roti], ["salad", salad], ["raita", raita]]),
  labels,
};
// fromRow indexes a category's own rows: 0 = the 12oz sabzi, 1 = the 8oz one.
const sabziTo = (toCategory: string, fromRow: number) => ({ fromCategory: "sabzi", toCategory, fromPicks: 1, fromRow });
const saladLine = [{ giveTu: 1, receiveTu: 1 }];

describe("receivesMissing", () => {
  it("lets a pair deliver a category the meal size has no row for", () => {
    expect(swapPairFits(sabzi, salad)).toBe(false);
    expect(swapPairFits(sabzi, salad, true)).toBe(true);
    expect(swapPairFits(roti, salad, true)).toBe(false);
  });

  it("an override line sizes the received portion", () => {
    const r = validateProposedSwap({ composition: large, applied: [], next: sabziTo("salad", 1), receivesMissing: true, overrides: saladLine, naturalFallback: false });
    expect(r).toMatchObject({ ok: true, qtyTo: 1, giveTu: 1, getTu: 1, receiveTu: 1 });
  });

  it("an amount with no line is refused when other amounts are off", () => {
    const r = validateProposedSwap({ composition: large, applied: [], next: sabziTo("salad", 0), receivesMissing: true, overrides: saladLine, naturalFallback: false });
    expect(r).toEqual({ ok: false, reason: NO_LINE_FOR_AMOUNT });
  });

  it("a smaller received portion reads in the label", () => {
    const r = validateProposedSwap({
      composition: large, applied: [], next: sabziTo("raita", 1), receivesMissing: true,
      overrides: [{ giveTu: 1, receiveTu: 0.25 }], naturalFallback: false,
    });
    expect(r).toMatchObject({ ok: true, getTu: 0.25, receiveTu: 0.25 });
    const row = { fromCategory: "sabzi", toCategory: "raita", qtyFrom: 1, qtyTo: 1, fromRow: 1, receiveTu: 0.25 };
    expect(swapLabel(row, (k) => labels[k as keyof typeof labels], Object.fromEntries(large.categories))).toBe("Sabzi · 8oz → Raita · 2oz");
  });

  it("without the flag the missing category is still refused", () => {
    const r = validateProposedSwap({ composition: large, applied: [], next: sabziTo("salad", 1), overrides: saladLine, naturalFallback: false });
    expect(r).toMatchObject({ ok: false });
    expect((r as { reason: string }).reason).toContain("can't be swapped");
  });

  it("the received category's per-tiffin cap still applies", () => {
    const three: CompositionContext = {
      ...large,
      mealSizeItems: [item("sabzi", 1, 0), item("sabzi", 1, 1), item("sabzi", 1, 2)],
      baseCounts: { sabzi: 3 },
    };
    const swap = (fromRow: number) => ({ fromCategory: "sabzi", toCategory: "salad", qtyFrom: 1, qtyTo: 1, fromRow, receiveTu: 1 });
    const args = { receivesMissing: true, overrides: saladLine, naturalFallback: false };
    const first = validateProposedSwap({ composition: three, applied: [], next: sabziTo("salad", 0), ...args });
    expect(first.ok).toBe(true);
    const second = validateProposedSwap({ composition: three, applied: [swap(0)], next: sabziTo("salad", 1), ...args });
    expect(second.ok).toBe(true);
    const third = validateProposedSwap({ composition: three, applied: [swap(0), swap(1)], next: sabziTo("salad", 2), ...args });
    expect(third).toMatchObject({ ok: false });
    expect((third as { reason: string }).reason).toContain("at most 2 Salad");
  });

  it("5 Item Regular: two 8oz sabzi both go to salad within the cap of 2", () => {
    const regular: CompositionContext = {
      ...large,
      mealSizeItems: [item("sabzi", 1, 0), item("sabzi", 1, 1), item("daal", 1, 2), item("rice", 1, 3), item("roti", 1.5, 4)],
      baseCounts: { sabzi: 2, daal: 1, rice: 1, roti: 1 },
    };
    const args = { receivesMissing: true, overrides: saladLine, naturalFallback: false };
    const applied = [{ fromCategory: "sabzi", toCategory: "salad", qtyFrom: 1, qtyTo: 1, fromRow: 0, receiveTu: 1 }];
    expect(validateProposedSwap({ composition: regular, applied: [], next: sabziTo("salad", 0), ...args }).ok).toBe(true);
    expect(validateProposedSwap({ composition: regular, applied, next: sabziTo("salad", 1), ...args }).ok).toBe(true);
  });

  it("refuses to swap back what a received swap brought in", () => {
    const applied = [{ fromCategory: "sabzi", toCategory: "salad", qtyFrom: 1, qtyTo: 1, fromRow: 1, receiveTu: 1 }];
    const r = validateProposedSwap({
      composition: large, applied, next: { fromCategory: "salad", toCategory: "sabzi", fromPicks: 1 }, receivesMissing: true,
    });
    expect(r).toMatchObject({ ok: false });
    expect((r as { reason: string }).reason).toMatch(/^Undo your/);
  });
});
