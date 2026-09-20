import { describe, expect, it } from "vitest";
import type { KitchenPackingSheet } from "@/lib/services/kitchen-packing-sheet.service";
import { kitchenSummaryAoA, packingSheetAoA } from "../kitchen-packing-excel";

const sheet: KitchenPackingSheet = {
  dateIso: "2026-10-23",
  itemHeaders: ["Item1", "Item2"],
  rows: [
    {
      deliveryPublicId: "d1",
      forDate: "2030-01-07",
      forLabel: null,
      deliveryDate: "2026-10-23",
      customerName: "Ada",
      orderId: "SUB-1",
      planName: "Non-Veg Plan",
      mealSizeName: "Maharaja Thali",
      items: ["Alpha Dish — 12 OZ × 1", "—"],
    },
    {
      deliveryPublicId: "d2",
      forDate: "2030-01-07",
      forLabel: null,
      deliveryDate: "2026-10-23",
      customerName: "Ben",
      orderId: "SUB-2",
      planName: "Pure Vegetarian Plan",
      mealSizeName: "5 Item Thali — Regular",
      items: ["Alpha Dish — 8 OZ × 1", "Beta Side — 4 roti × 1"],
    },
  ],
  summary: [
    { dish: "Alpha Dish", portion: "12oz", totalQuantity: 1 },
    { dish: "Alpha Dish", portion: "8oz", totalQuantity: 1 },
    { dish: "Beta Side", portion: "4 roti", totalQuantity: 1 },
  ],
};

describe("packingSheetAoA", () => {
  it("uses Item1…ItemN headers with dish+portion in cells — never dish names as columns", () => {
    const aoa = packingSheetAoA(sheet);
    expect(aoa[0]?.[0]).toBe("DAILY KITCHEN PACKING SHEET");
    expect(aoa[2]).toEqual([
      "Delivery Date",
      "Customer",
      "Order ID",
      "Plan Name",
      "Meal Size",
      "Item1",
      "Item2",
    ]);
    expect(aoa[3]).toEqual([
      "2026-10-23",
      "Ada",
      "SUB-1",
      "Non-Veg Plan",
      "Maharaja Thali",
      "Alpha Dish — 12 OZ × 1",
      "—",
    ]);
  });
});

describe("kitchenSummaryAoA", () => {
  it("aggregates by dish + portion unit with totals", () => {
    const aoa = kitchenSummaryAoA(sheet);
    expect(aoa[0]?.[0]).toBe("Kitchen Summary");
    expect(aoa[2]).toEqual(["Food Item", "Portion / Unit", "Total Quantity"]);
    expect(aoa[3]).toEqual(["Alpha Dish", "12 OZ", 1]);
    expect(aoa[5]).toEqual(["Beta Side", "4 roti", 1]);
  });
});
