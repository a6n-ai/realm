import { csvResponse } from "@/lib/files/export-response";
import { appTodayIso } from "@/lib/dates/today";
import { handler, problem } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { epochRange, withListDates } from "@/lib/list/default-month";
import { parseSort } from "@foundry/design-system/list-sort";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { giveHistoryCsv, type GiveSortColumn } from "@/lib/customer-groups/customer-groups.service";

export const GET = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const sp = await withListDates(Object.fromEntries(new URL(req.url).searchParams));
  const sort = parseSort<GiveSortColumn>(
    sp,
    ["when", "customer", "coins", "type", "group", "givenBy", "memo"],
    { column: "when", dir: "desc" },
  );
  const type = sp.type === "group" || sp.type === "one" ? sp.type : undefined;
  const { timezone } = await getAppSettings();
  const result = await giveHistoryCsv(
    {
      q: sp.q,
      type,
      givenBy: sp.givenBy || undefined,
      group: sp.inGroup || undefined,
      range: epochRange(sp),
      sort,
    },
    timezone,
  );
  if (!result.ok) return problem(500, result.error);
  return csvResponse(`grant-history-${appTodayIso(timezone)}.csv`, result.csv);
});
