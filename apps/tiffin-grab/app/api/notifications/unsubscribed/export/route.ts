import { csvResponse } from "@/lib/files/export-response";
import { csvCell } from "@/lib/csv-cell";
import { problem } from "@foundry/routes";
import { adminRoute } from "@/lib/notifications/admin-route";
import { loadSuppressedAddresses } from "@/lib/notifications/logs-query";

/** The Unsubscribed table as CSV, with the same filters as the page. */
export const GET = adminRoute(async (req) => {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const lines = [["address", "channel", "reason", "scope", "source", "campaign", "date"].join(",")];
  // ponytail: pages through the table query, capped at 200 pages; stream if the list outgrows that.
  for (let page = 0; page < 200; page++) {
    const { rows, total } = await loadSuppressedAddresses({ ...sp, page: String(page), size: "100" });
    for (const r of rows) {
      lines.push(
        [r.address, r.channel, r.reason, r.scope, r.source, r.campaignName, new Date(r.createdAt).toISOString()].map(csvCell).join(","),
      );
    }
    if (lines.length - 1 >= total) break;
    // A do-not-mail list that is silently short is worse than no file.
    if (rows.length === 0 || page === 199) return problem(500, "The list is too large to export here. Narrow the filters and try again.");
  }
  return csvResponse("unsubscribed.csv", lines.join("\n"));
});
