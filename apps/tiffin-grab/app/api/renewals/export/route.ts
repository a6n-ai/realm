import { zonedDateIso } from "@foundry/commons";
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
import { parseRenewalsFilter } from "@/lib/renewals/filters";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import {
  listRenewalsForExport,
  listRenewedCustomersForExport,
  type RenewalRange,
} from "@/lib/services/renewals.service";

export const GET = handler(async (request: Request): Promise<Response> => {
  await requirePermission({ order: ["read"] });

  const sp = await withListDates(Object.fromEntries(new URL(request.url).searchParams));
  const f = parseRenewalsFilter(sp);
  const columns = parseExportColumns(sp.columns ?? null, f.tab);

  const [visible, { timezone }] = await Promise.all([resolveSessionVisibleOrgIds(await getSession()), getAppSettings()]);
  const today = zonedDateIso(Date.now(), timezone);
  const range: RenewalRange = {
    by: f.dateBy,
    fromMs: f.from,
    toMs: f.to,
    fromIso: f.from != null ? zonedDateIso(f.from, timezone) : null,
    toIso: f.to != null ? zonedDateIso(f.to, timezone) : null,
  };

  const headers = exportHeaders(f.tab, columns);
  const records =
    f.tab === "customers"
      ? (await listRenewedCustomersForExport(visible, { renewedWithin: f.renewed, q: f.q, from: f.from, to: f.to })).map((r) =>
          customerRowToExcelRecord(r, timezone, columns),
        )
      : (await listRenewalsForExport(visible, f, today, range)).map((r) => planRowToExcelRecord(r, f.tab, today, columns));

  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(records, { header: headers });
  const workbook = XLSX.utils.book_new();
  const sheetName = f.tab === "customers" ? "Renewed customers" : f.tab === "trials" ? "Trials" : "Renewals";
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const dateIso = zonedDateIso(Date.now(), timezone);
  const fileStem = f.tab === "customers" ? "renewed-customers" : f.tab === "trials" ? "trial-conversions" : "renewals";
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileStem}-${dateIso}.xlsx"`,
    },
  });
});
