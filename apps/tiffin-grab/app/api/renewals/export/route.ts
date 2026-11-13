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
import { getAppSettings } from "@/lib/services/app-settings.service";
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

  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(records, { header: headers });
  const workbook = XLSX.utils.book_new();
  const sheetName = f.tab === "customers" ? "Renewed customers" : "Renewals";
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const dateIso = appTodayIso(timezone);
  const fileStem = f.tab === "customers" ? "renewed-customers" : "renewals";
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileStem}-${dateIso}.xlsx"`,
    },
  });
});
