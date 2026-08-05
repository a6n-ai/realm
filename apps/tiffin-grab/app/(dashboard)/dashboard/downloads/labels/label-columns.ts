// Single source of truth for the label table's column headers, shared by the on-screen table
// and the Excel export so the two can never drift. Item slots are filled dynamically per order
// (whatever categories that order/day resolves to, in sortOrder) — these headers describe the
// physical container each slot is packed into, not a fixed category-to-slot mapping.
import type { PackingLabelRow } from "@/lib/services/labels.service";

export const ITEM_HEADERS = [
  ["1st item(12oz)", "Qty(1st item(12oz))"],
  ["2nd Item(12oz)", "QTY(2nd Item(12oz))"],
  ["3rd Item(8oz)", "Qty(3rd Item(8oz))"],
  ["4th Item(Generally Salad)", "Qty(4th Item)"],
  ["5th Item(Generally Raita)", "Qty(5th Item)"],
  ["6th Item", "Qty(6th Item)"],
  ["7th Item", "Qty(7th Item)"],
] as const;

export const LABEL_COLUMNS = [
  { key: "customerPhone", header: "CustomersNumber" },
  { key: "firstName", header: "FirstName" },
  { key: "planName", header: "Plan Name" },
  ...ITEM_HEADERS.flatMap(([itemHeader, qtyHeader]) => [
    { key: "item", header: itemHeader },
    { key: "qty", header: qtyHeader },
  ]),
] as const;

export function labelRowToExcelRecord(row: PackingLabelRow): Record<string, string | number> {
  const record: Record<string, string | number> = {
    CustomersNumber: row.customerPhone,
    FirstName: row.firstName,
    "Plan Name": row.planName,
  };
  ITEM_HEADERS.forEach(([itemHeader, qtyHeader], i) => {
    const item = row.items[i];
    record[itemHeader] = item?.name ?? "";
    record[qtyHeader] = item?.qty ?? "";
  });
  return record;
}
