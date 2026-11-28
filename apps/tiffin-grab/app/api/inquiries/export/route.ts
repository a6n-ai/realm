import { zonedDateIso } from "@foundry/commons";
import { dayRange } from "@foundry/commons/util/dates";
import { handler } from "@foundry/routes";
import { inquiryListQuery } from "@/app/(dashboard)/dashboard/inquiries/list-query";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { requestNow } from "@/lib/dates/request-now";
import { xlsxResponse } from "@/lib/files/export-response";
import { inquiriesService } from "@/lib/inquiries/inquiries.service";
import { getAppSettings } from "@/lib/settings";

// xlsx, not CSV: cells stay text, so "+1647..." keeps its plus and user text never runs as a formula.
export const GET = handler(async (request: Request): Promise<Response> => {
  await requirePermission({ inquiry: ["export"] });
  const session = await getSession();
  const [visible, { bucket, queue, condition, bucketWhere }, { timezone }] = await Promise.all([
    resolveSessionVisibleOrgIds(session),
    inquiryListQuery(Object.fromEntries(new URL(request.url).searchParams), session?.user.id),
    getAppSettings(),
  ]);
  const today = zonedDateIso(requestNow(), timezone);
  const { start: dayStart, end: dayEnd } = dayRange(today, timezone);
  const rows = await inquiriesService.listContacts(visible, condition, bucket ? undefined : { tab: queue, dayStart, dayEnd }, bucketWhere);
  return xlsxResponse(`inquiries-${bucket ?? queue}-${today}.xlsx`, {
    name: "Inquiries",
    headers: ["Name", "Email", "Phone"],
    records: rows.map((r) => ({ Name: r.fullName ?? "", Email: r.email ?? "", Phone: r.phone ?? "" })),
  });
});
