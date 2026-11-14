import { xlsxResponse } from "@/lib/files/export-response";
import { handler } from "@foundry/routes";
import { customerListQuery } from "@/app/(dashboard)/dashboard/customers/list-query";
import { requireStaff } from "@/lib/auth/guards";
import { appTodayIso } from "@/lib/dates/today";
import { formatEpoch } from "@/lib/format/datetime";
import { getAppSettings } from "@/lib/settings";
import { listCustomersPage } from "@/lib/services/customers.service";

const HEADERS = ["Name", "Email", "Phone", "Total paid", "Free tiffins", "Cancelled orders", "Latest order", "Latest order status", "Last delivered"];
// shortcut: one query capped at 10k customers; page through listCustomersPage if the book outgrows it.
const MAX_ROWS = 10_000;

/** All pages, not just the visible one. */
export const GET = handler(async (request: Request): Promise<Response> => {
  await requireStaff();
  const [{ sort, condition, custom }, { timezone }] = await Promise.all([
    customerListQuery(Object.fromEntries(new URL(request.url).searchParams)),
    getAppSettings(),
  ]);
  const { items } = await listCustomersPage(condition, { page: 0, size: MAX_ROWS }, sort, custom);
  const records = items.map((c) => ({
    Name: c.name ?? "",
    Email: c.email ?? "",
    Phone: c.phone ?? "",
    "Total paid": Number(c.totalPaid),
    "Free tiffins": c.freeTiffins,
    "Cancelled orders": c.cancelledOrders,
    "Latest order": c.latestOrderAt ? formatEpoch(c.latestOrderAt, { mode: "date", timeZone: timezone }) : "",
    "Latest order status": c.latestStatus ?? "",
    "Last delivered": c.lastDelivered ?? "",
  }));

  return xlsxResponse(`customers-${appTodayIso(timezone)}.xlsx`, { name: "Customers", headers: HEADERS, records });
});
