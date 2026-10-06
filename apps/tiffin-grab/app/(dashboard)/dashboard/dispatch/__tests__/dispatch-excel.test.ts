import { describe, expect, it } from "vitest";
import type { DispatchRow } from "@/lib/services/optimoroute/drivers";
import { dispatchSheetAoA, sortDispatchForExport } from "../dispatch-excel";

function row(over: Partial<DispatchRow> & Pick<DispatchRow, "orderNo" | "customerName">): DispatchRow {
  return {
    phone: null,
    tiffinUnits: 1,
    coveredDates: ["2026-10-06"],
    coverage: null,
    notes: "",
    routeDriverSerial: null,
    routeDriverName: null,
    routeStopNumber: null,
    routeSyncedAt: null,
    ...over,
  };
}

describe("sortDispatchForExport", () => {
  it("puts unassigned last, then driver name, then stop number", () => {
    const sorted = sortDispatchForExport([
      row({ orderNo: "u", customerName: "Unassigned", routeStopNumber: 1 }),
      row({ orderNo: "b2", customerName: "Ben", routeDriverName: "Alex", routeDriverSerial: "005", routeStopNumber: 2 }),
      row({ orderNo: "b1", customerName: "Ada", routeDriverName: "Alex", routeDriverSerial: "005", routeStopNumber: 1 }),
      row({ orderNo: "c", customerName: "Cara", routeDriverName: "Blake", routeDriverSerial: "007", routeStopNumber: 1 }),
    ]);
    expect(sorted.map((r) => r.orderNo)).toEqual(["b1", "b2", "c", "u"]);
  });
});

describe("dispatchSheetAoA", () => {
  it("writes phone, driver, driver #, and stop like the packing export", () => {
    const aoa = dispatchSheetAoA("2026-10-06", [
      row({
        orderNo: "dlv_1",
        customerName: "Ada",
        phone: "4165550100",
        routeDriverName: "Alex",
        routeDriverSerial: "005",
        routeStopNumber: 3,
        tiffinUnits: 2,
        coverage: "Covers Mon + Tue · 2 tiffins",
      }),
    ]);
    expect(aoa[0]?.[0]).toBe("DISPATCH");
    expect(aoa[2]).toEqual([
      "Customer",
      "Phone",
      "Driver",
      "Driver #",
      "Stop #",
      "Tiffins",
      "Coverage",
      "Delivery ID",
    ]);
    expect(aoa[3]).toEqual([
      "Ada",
      "4165550100",
      "Alex",
      "005",
      3,
      2,
      "Covers Mon + Tue · 2 tiffins",
      "dlv_1",
    ]);
  });
});
