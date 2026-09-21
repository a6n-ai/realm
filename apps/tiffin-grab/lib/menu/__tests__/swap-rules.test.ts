import { describe, expect, it } from "vitest";
import { capViolation, swapPairFits, swapQuantities, type SwapCategory } from "../swap-rules";

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
  it("fits a same-unit category the meal size lacks (non-veg 4-item: curry -> sabzi)", () => {
    expect(swapPairFits(curry8, sabziAbsent)).toBe(true);
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
  it("trades like-for-like into a missing category (12oz curry -> one 12oz sabzi)", () => {
    expect(swapQuantities(curry12, sabziAbsent, 1)).toEqual({ ok: true, qtyTo: 1 });
  });
  it("converts across TU sizes (1 rice -> 4 roti, 4 roti -> 1 rice)", () => {
    expect(swapQuantities(rice, roti, 1)).toEqual({ ok: true, qtyTo: 4 });
    expect(swapQuantities(roti, rice, 4)).toEqual({ ok: true, qtyTo: 1 });
  });
  it("refuses a trade that does not divide evenly", () => {
    expect(swapQuantities(roti, rice, 1)).toMatchObject({ ok: false });
  });
  it("refuses 1 TU for half a pick — a swap only ever moves whole picks, never a fraction", () => {
    const doubleTu = cat("bigportion", 2);
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
