// Dispatch workbook for one day: the same phone / driver / stop columns as the
// packing sheet export, plus tiffin count and coverage for the route sheet.
import type { DispatchRow } from "@/lib/services/optimoroute/drivers";

const HEADERS = [
  "Customer",
  "Phone",
  "Driver",
  "Driver #",
  "Stop #",
  "Tiffins",
  "Coverage",
  "Delivery ID",
] as const;

/** Same unassigned-last, driver, then stop order the Dispatch table uses. */
export function sortDispatchForExport(rows: DispatchRow[]): DispatchRow[] {
  const UNASSIGNED = "__unassigned__";
  return [...rows].sort((a, b) => {
    const aKey = a.routeDriverSerial ?? a.routeDriverName ?? UNASSIGNED;
    const bKey = b.routeDriverSerial ?? b.routeDriverName ?? UNASSIGNED;
    if (aKey === UNASSIGNED && bKey !== UNASSIGNED) return 1;
    if (bKey === UNASSIGNED && aKey !== UNASSIGNED) return -1;
    const nameCompare = (a.routeDriverName ?? aKey).localeCompare(b.routeDriverName ?? bKey);
    if (nameCompare !== 0) return nameCompare;
    return (a.routeStopNumber ?? Infinity) - (b.routeStopNumber ?? Infinity);
  });
}

export function dispatchSheetAoA(dateIso: string, rows: DispatchRow[]): (string | number)[][] {
  const sorted = sortDispatchForExport(rows);
  const title = ["DISPATCH", `Delivery date: ${dateIso}`];
  const blank: string[] = [];
  const body = sorted.map((r) => [
    r.customerName,
    r.phone ?? "",
    r.routeDriverName ?? r.routeDriverSerial ?? "",
    r.routeDriverSerial ?? "",
    r.routeStopNumber ?? "",
    r.tiffinUnits,
    r.coverage ?? "",
    r.orderNo,
  ]);
  return [title, blank, [...HEADERS], ...body];
}

export async function writeDispatchWorkbook(dateIso: string, rows: DispatchRow[], filename: string): Promise<void> {
  const XLSX = await import("xlsx");
  const aoa = dispatchSheetAoA(dateIso, rows);
  const sheet = XLSX.utils.aoa_to_sheet(aoa);

  sheet["!freeze"] = { xSplit: 0, ySplit: 3, topLeftCell: "A4", activePane: "bottomLeft", state: "frozen" };
  if (rows.length > 0) {
    sheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 2, c: 0 },
        e: { r: 2 + rows.length, c: HEADERS.length - 1 },
      }),
    };
  }
  sheet["!cols"] = [
    { wch: 22 },
    { wch: 14 },
    { wch: 18 },
    { wch: 10 },
    { wch: 8 },
    { wch: 8 },
    { wch: 24 },
    { wch: 18 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Dispatch");
  XLSX.writeFile(workbook, filename);
}
