import { xlsxResponse } from "@/lib/files/export-response";
import { handler } from "@foundry/routes";
import { customerListQuery } from "@/app/(dashboard)/dashboard/customers/list-query";
import { can, requirePermission } from "@/lib/auth/guards";
import { appTodayIso } from "@/lib/dates/today";
import { customerExportRows } from "@/lib/customers/customer-export";
import { getAppSettings } from "@/lib/settings";
import { listCustomersPage } from "@/lib/services/customers.service";

// shortcut: one query capped at 10k customers; page through listCustomersPage if the book outgrows it.
const MAX_ROWS = 10_000;

/** All pages, not just the visible one. */
export const GET = handler(async (request: Request): Promise<Response> => {
  await requirePermission({ customer: ["export"] });
  const canFinance = await can({ finance: ["read"] });
  const [{ sort, condition, custom }, { timezone }] = await Promise.all([
    customerListQuery(Object.fromEntries(new URL(request.url).searchParams)),
    getAppSettings(),
  ]);
  const { items } = await listCustomersPage(condition, { page: 0, size: MAX_ROWS }, sort, custom, { withPayments: canFinance });
  const { headers, records } = customerExportRows(items, { canFinance, timezone });

  return xlsxResponse(`customers-${appTodayIso(timezone)}.xlsx`, { name: "Customers", headers, records });
});
