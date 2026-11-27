import { handler } from "@foundry/routes";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { appTodayIso } from "@/lib/dates/today";
import { xlsxResponse } from "@/lib/files/export-response";
import { inquiriesService } from "@/lib/inquiries/inquiries.service";
import { getAppSettings } from "@/lib/settings";

// xlsx, not CSV: cells stay text, so "+1647..." keeps its plus and user text never runs as a formula.
export const GET = handler(async (): Promise<Response> => {
  await requirePermission({ inquiry: ["export"] });
  const visible = await resolveSessionVisibleOrgIds(await getSession());
  const [rows, { timezone }] = await Promise.all([inquiriesService.listContacts(visible), getAppSettings()]);
  return xlsxResponse(`inquiries-${appTodayIso(timezone)}.xlsx`, {
    name: "Inquiries",
    headers: ["Name", "Email", "Phone"],
    records: rows.map((r) => ({ Name: r.fullName ?? "", Email: r.email ?? "", Phone: r.phone ?? "" })),
  });
});
