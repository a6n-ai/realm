import { xlsxResponse } from "@/lib/files/export-response";
import { appTodayIso } from "@/lib/dates/today";
import { dayRange } from "@foundry/commons/util/dates";
import { handler } from "@foundry/routes";
import {
  customerRowToExcelRecord,
  exportHeaders,
  parseExportColumns,
  planRowToExcelRecord,
} from "@/app/(dashboard)/dashboard/renewals/renewal-export-columns";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { withListDates } from "@/lib/list/default-month";
import { parseRenewalsFilter, resolveRange } from "@/lib/renewals/filters";
import { getAppSettings } from "@/lib/settings";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { resolveOwnerParam } from "@/lib/list/presets";
import {
  listRenewalsForExport,
  listRenewedCustomersForExport,
} from "@/lib/renewals/renewals.service";

export const GET = handler(async (request: Request): Promise<Response> => {
  await requirePermission({ order: ["read"] });

  const sp = await withListDates(Object.fromEntries(new URL(request.url).searchParams));
  const f = parseRenewalsFilter(sp);
  const columns = parseExportColumns(sp.columns ?? null, f.tab);

  const session = await getSession();
  const [visible, { timezone }] = await Promise.all([resolveSessionVisibleOrgIds(session), getAppSettings()]);
  const today = appTodayIso(timezone);
  const range = resolveRange(f, timezone);
  const day = dayRange(today, timezone);
  const owner = resolveOwnerParam(f.owner ?? undefined, session?.user.id) ?? null;

  const headers = exportHeaders(f.tab, columns);
  const records =
    f.tab === "customers"
      ? (await listRenewedCustomersForExport(visible, { renewedWithin: f.renewed, q: f.q, from: f.from, to: f.to })).map((r) =>
          customerRowToExcelRecord(r, timezone, columns),
        )
      : (await listRenewalsForExport(visible, { ...f, owner }, today, range, { dayStart: day.start, dayEnd: day.end })).map((r) =>
          planRowToExcelRecord(r, today, timezone, columns),
        );

  const dateIso = appTodayIso(timezone);
  const isCustomers = f.tab === "customers";
  return xlsxResponse(`${isCustomers ? "renewed-customers" : "renewals"}-${dateIso}.xlsx`, {
    name: isCustomers ? "Renewed customers" : "Renewals",
    headers,
    records,
  });
});
