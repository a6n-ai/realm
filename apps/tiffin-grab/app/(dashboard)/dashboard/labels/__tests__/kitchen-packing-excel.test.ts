import { describe, expect, it } from "vitest";
import type { KitchenPackingSheet } from "@/lib/services/kitchen-packing-sheet.service";
import { kitchenSummaryAoA, packingSheetAoA } from "../kitchen-packing-excel";

const sheet: KitchenPackingSheet = {
  dateIso: "2026-10-23",
  dishColumns: ["Alpha Dish", "Beta Side"],
  rows: [
    {
      deliveryPublicId: "d1",
      deliveryDate: "2026-10-23",
      customerName: "Ada",
      orderId: "SUB-1",
      planName: "Non-Veg Plan",
      mealSizeName: "Maharaja Thali",
      cells: { "Alpha Dish": "12 OZ × 1", "Beta Side": "—" },
    },
    {
      deliveryPublicId: "d2",
      deliveryDate: "2026-10-23",
      customerName: "Ben",
      orderId: "SUB-2",
      planName: "Pure Vegetarian Plan",
      mealSizeName: "5 Item Thali — Regular",
      cells: { "Alpha Dish": "8 OZ × 1", "Beta Side": "4 roti × 1" },
    },
  ],
  summary: [
    { dish: "Alpha Dish", portion: "12oz", totalQuantity: 1 },
    { dish: "Alpha Dish", portion: "8oz", totalQuantity: 1 },
    { dish: "Beta Side", portion: "4 roti", totalQuantity: 1 },
  ],
};

describe("packingSheetAoA", () => {
  it("puts fixed columns first and dish names as dynamic headers — never hard-coded foods", () => {
    const aoa = packingSheetAoA(sheet);
    expect(aoa[0]?.[0]).toBe("DAILY KITCHEN PACKING SHEET");
    expect(aoa[2]).toEqual([
      "Delivery Date",
      "Customer",
      "Order ID",
      "Plan Name",
      "Meal Size",
      "Alpha Dish",
      "Beta Side",
    ]);
    expect(aoa[3]).toEqual([
      "2026-10-23",
      "Ada",
      "SUB-1",
      "Non-Veg Plan",
      "Maharaja Thali",
      "12 OZ × 1",
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
