import { formatEpoch } from "@/lib/format/datetime";
import type { CustomerRow } from "@/lib/services/customers.service";

const COLUMNS = ["Name", "Email", "Phone", "Total paid", "Free tiffins", "Cancelled orders", "Latest order", "Latest order status", "Last delivered"] as const;

/** "Total paid" is finance data: the column is written only when the caller holds finance:read. */
export function customerExportRows(items: CustomerRow[], opts: { canFinance: boolean; timezone: string }) {
  const headers = COLUMNS.filter((h) => opts.canFinance || h !== "Total paid");
  const records = items.map((c) => {
    const row: Record<string, unknown> = {
      Name: c.name ?? "",
      Email: c.email ?? "",
      Phone: c.phone ?? "",
      "Total paid": opts.canFinance ? Number(c.totalPaid) : undefined,
      "Free tiffins": c.freeTiffins,
      "Cancelled orders": c.cancelledOrders,
      "Latest order": c.latestOrderAt ? formatEpoch(c.latestOrderAt, { mode: "date", timeZone: opts.timezone }) : "",
      "Latest order status": c.latestStatus ?? "",
      "Last delivered": c.lastDelivered ?? "",
    };
    return Object.fromEntries(headers.map((h) => [h, row[h]]));
  });
  return { headers: [...headers], records };
}
