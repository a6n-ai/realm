import { describe, expect, it } from "vitest";
import { capViolation, hasEvenPortionSwap, swapPairFits, swapQuantities, type SwapCategory } from "../swap-rules";

const cat = (key: string, pickTu: number | null, over: Partial<SwapCategory> = {}): SwapCategory => ({
  key, pickTu, unitType: "weight", unitLabel: "oz", maxPicksPerTiffin: null, ...over,
});

const curry8 = cat("curry", 1, { maxPicksPerTiffin: 1 });
const curry12 = cat("curry", 1.5, { maxPicksPerTiffin: 1 });
const daal8 = cat("daal", 1);
const sabziAbsent = cat("sabzi", null);
const roti = cat("roti", 0.25, { unitType: "count", unitLabel: "roti" });
const rice = cat("rice", 1, { unitType: "count", unitLabel: "unit" });
const riceAbsent = cat("rice", null, { unitType: "count", unitLabel: "unit" });

describe("swapPairFits", () => {
  it("fits when both categories are on the meal size", () => {
    expect(swapPairFits(curry8, daal8)).toBe(true);
  });
  it("rejects a destination the meal size lacks, even in the same unit (no Salad on Sabzi Only)", () => {
    expect(swapPairFits(curry8, sabziAbsent)).toBe(false);
  });
  it("lets a same-unit pick received earlier be given on (from side absent)", () => {
    expect(swapPairFits(sabziAbsent, daal8)).toBe(true);
  });
  it("rejects a missing category measured in a different unit", () => {
    expect(swapPairFits(roti, riceAbsent)).toBe(false);
  });
  it("rejects when neither side is on the meal size", () => {
    expect(swapPairFits(sabziAbsent, cat("salad", null))).toBe(false);
  });
});

describe("swapQuantities", () => {
  it("refuses a destination the meal size lacks", () => {
    expect(swapQuantities(curry12, sabziAbsent, 1)).toMatchObject({ ok: false });
  });
  it("same unit is like-for-like, one pick for one (12oz curry -> one daal)", () => {
    expect(swapQuantities(curry12, daal8, 1)).toEqual({ ok: true, qtyTo: 1 });
    expect(swapQuantities(curry12, daal8, 2)).toEqual({ ok: true, qtyTo: 2 });
  });
  it("converts across TU sizes (1 rice -> 4 roti, 4 roti -> 1 rice)", () => {
    expect(swapQuantities(rice, roti, 1)).toEqual({ ok: true, qtyTo: 4 });
    expect(swapQuantities(roti, rice, 4)).toEqual({ ok: true, qtyTo: 1 });
  });
  it("refuses a trade that does not divide evenly", () => {
    expect(swapQuantities(roti, rice, 1)).toMatchObject({ ok: false, reason: "This swap requires an even portion exchange." });
  });
  it("refuses 1 TU for half a pick across units — a swap only ever moves whole picks", () => {
    const doubleTu = cat("bigportion", 2, { unitType: "count", unitLabel: "unit" });
    expect(swapQuantities(daal8, doubleTu, 1)).toMatchObject({ ok: false });
  });
});

describe("capViolation", () => {
  it("allows exactly one non-veg curry", () => {
    expect(capViolation({ curry: 1, daal: 1 }, curry8)).toBeNull();
  });
  it("blocks a second non-veg curry", () => {
    expect(capViolation({ curry: 2, daal: 0 }, curry8)).toBe("At most 1 curry per tiffin");
  });
  it("never caps an uncapped category (3 daal is fine)", () => {
    expect(capViolation({ daal: 3 }, daal8)).toBeNull();
  });
});

describe("swapAmounts / swapLabel (human units, never TU)", () => {
  const rice = { key: "rice", pickTu: 1, unitType: "weight" as const, unitLabel: "oz", maxPicksPerTiffin: null, unitSize: 6 };
  const roti = { key: "roti", pickTu: 0.25, unitType: "count" as const, unitLabel: "roti", maxPicksPerTiffin: null, unitSize: 2 };
  it("1 rice pick (1 TU = 6oz) equals 4 roti picks (0.25 TU each, 1 TU = 2 roti)", async () => {
    const { swapAmounts, swapLabel } = await import("../swap-rules");
    expect(swapAmounts(rice, roti, 1, 4)).toEqual({ give: "6oz", get: "2 roti" });
    expect(swapLabel({ fromCategory: "rice", toCategory: "roti", qtyFrom: 1, qtyTo: 4 }, (k) => k, { rice, roti })).toBe("rice · 6oz → roti · 2 roti");
  });
  it("falls back to pick counts without unit sizes", async () => {
    const { swapLabel } = await import("../swap-rules");
    expect(swapLabel({ fromCategory: "rice", toCategory: "roti", qtyFrom: 1, qtyTo: 4 }, (k) => k)).toBe("1 rice → 4 roti");
  });
});

describe("labelAppliedSwaps (front-splice slot sizes, not first-row pickTu)", () => {
  const sabzi: SwapCategory = {
    key: "sabzi",
    pickTu: 1.5,
    slotTu: [1.5, 1.0],
    unitType: "weight",
    unitLabel: "oz",
    unitSize: 8,
    maxPicksPerTiffin: null,
  };
  const daal: SwapCategory = {
    key: "daal",
    pickTu: 1.5,
    slotTu: [1.5],
    unitType: "weight",
    unitLabel: "oz",
    unitSize: 8,
    maxPicksPerTiffin: null,
  };
  const cats = { sabzi, daal };
  const label = (k: string) => (k === "sabzi" ? "Sabzi" : k === "daal" ? "Daal" : k);

  it("labels successive Sabzi→Daal swaps with the actual 12oz then 8oz slots", async () => {
    const { labelAppliedSwaps } = await import("../swap-rules");
    const swaps = [
      { fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 },
      { fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 },
    ];
    expect(labelAppliedSwaps(swaps, label, cats)).toEqual([
      "Sabzi · 12oz → Daal · 12oz",
      "Sabzi · 8oz → Daal · 8oz",
    ]);
  });

  it("swapLabel alone still uses first-row pickTu (callers of applied stacks must use labelAppliedSwaps)", async () => {
    const { swapLabel } = await import("../swap-rules");
    const second = { fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 };
    expect(swapLabel(second, label, cats)).toBe("Sabzi · 12oz → Daal · 12oz");
  });
});

describe("hasEvenPortionSwap (Swap entry gate)", () => {
  it("is true when some give count in 1..available divides evenly", () => {
    expect(hasEvenPortionSwap(rice, roti, 1)).toBe(true);
    expect(hasEvenPortionSwap(roti, rice, 1)).toBe(false);
    expect(hasEvenPortionSwap(roti, rice, 4)).toBe(true);
  });
  it("is false when leftover picks cannot form an even exchange", () => {
    const awkward = cat("rice", 1.5, { unitType: "count", unitLabel: "unit" });
    const whole = cat("roti", 1, { unitType: "count", unitLabel: "roti" });
    expect(hasEvenPortionSwap(awkward, whole, 1)).toBe(false);
  });
});
