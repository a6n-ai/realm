// Builds the DAILY KITCHEN PACKING SHEET workbook from a KitchenPackingSheet.
// Dish columns come from the sheet data — never hard-coded here.
import type { KitchenPackingSheet } from "@/lib/services/kitchen-packing-sheet.service";
import { formatPortionUnit } from "@/lib/menu/packing-requirement";

const FIXED_HEADERS = ["Delivery Date", "Customer", "Order ID"] as const;

export function packingSheetAoA(sheet: KitchenPackingSheet): (string | number)[][] {
  const header = [...FIXED_HEADERS, ...sheet.dishColumns];
  const title = ["DAILY KITCHEN PACKING SHEET", `Delivery date: ${sheet.dateIso}`];
  const blank: string[] = [];
  const rows = sheet.rows.map((r) => [
    r.deliveryDate,
    r.customerName,
    r.orderId,
    ...sheet.dishColumns.map((dish) => r.cells[dish] ?? "—"),
  ]);
  return [title, blank, header, ...rows];
}

export function kitchenSummaryAoA(sheet: KitchenPackingSheet): (string | number)[][] {
  const header = ["Food Item", "Portion / Unit", "Total Quantity"];
  const title = ["Kitchen Summary", `Delivery date: ${sheet.dateIso}`];
  const blank: string[] = [];
  const rows = sheet.summary.map((line) => [
    line.dish,
    formatPortionUnit(line.portion) || line.portion,
    line.totalQuantity,
  ]);
  return [title, blank, header, ...rows];
}

export async function writeKitchenPackingWorkbook(
  sheet: KitchenPackingSheet,
  filename: string,
): Promise<void> {
  const XLSX = await import("xlsx");
  const packing = XLSX.utils.aoa_to_sheet(packingSheetAoA(sheet));
  const summary = XLSX.utils.aoa_to_sheet(kitchenSummaryAoA(sheet));

  // Header is row 3 (1-based) after title + blank — freeze that and enable filters.
  packing["!freeze"] = { xSplit: 0, ySplit: 3, topLeftCell: "A4", activePane: "bottomLeft", state: "frozen" };
  const lastCol = 2 + sheet.dishColumns.length;
  const lastRow = 2 + sheet.rows.length;
  if (sheet.rows.length > 0) {
    packing["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: 2, c: 0 }, e: { r: lastRow, c: lastCol } }),
    };
  }
  packing["!cols"] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 16 },
    ...sheet.dishColumns.map(() => ({ wch: 18 })),
  ];

  summary["!freeze"] = { xSplit: 0, ySplit: 3, topLeftCell: "A4", activePane: "bottomLeft", state: "frozen" };
  if (sheet.summary.length > 0) {
    summary["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: 2, c: 0 }, e: { r: 2 + sheet.summary.length, c: 2 } }),
    };
  }
  summary["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, packing, "Packing");
  XLSX.utils.book_append_sheet(workbook, summary, "Kitchen Summary");
  XLSX.writeFile(workbook, filename);
}
