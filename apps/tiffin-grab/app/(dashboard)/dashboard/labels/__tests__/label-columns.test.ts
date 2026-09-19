import { describe, expect, it } from "vitest";
import { LABEL_COLUMNS, labelRowToExcelRecord } from "../label-columns";
import type { PackingLabelRow } from "@/lib/services/labels.service";

const row: PackingLabelRow = {
  deliveryPublicId: "dlv_1",
  customerPhone: "(416) 555-1234",
  firstName: "Aafreen",
  planName: "Non-Veg Tiffin",
  mealSizeName: "Maharaja Thali",
  items: [{ name: "Chicken Curry 12oz", qty: 1 }, { name: "Jeera Rice 1", qty: 1 }],
};

describe("labelRowToExcelRecord", () => {
  it("puts Meal Size after Plan Name so the kitchen sheet names the product, not just the diet", () => {
    const headers = LABEL_COLUMNS.map((c) => c.header);
    expect(headers.slice(0, 4)).toEqual(["CustomersNumber", "FirstName", "Plan Name", "Meal Size"]);

    const record = labelRowToExcelRecord(row);
    expect(record["Meal Size"]).toBe("Maharaja Thali");
    expect(record["1st item(12oz)"]).toBe("Chicken Curry 12oz");
  });
});
