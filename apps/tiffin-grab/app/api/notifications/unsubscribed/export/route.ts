import { handler } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { loadSuppressedAddresses } from "@/lib/notifications/logs-query";

// Quote every cell; prefix formula starters so a spreadsheet never runs an address as a formula.
const cell = (v: unknown) => {
  const s = String(v ?? "");
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** The Unsubscribed table as CSV, with the same filters as the page. */
export const GET = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const lines = [["address", "channel", "reason", "scope", "source", "campaign", "date"].join(",")];
  // ponytail: pages through the table query, capped at 200 pages; stream if the list outgrows that.
  for (let page = 0; page < 200; page++) {
    const { rows, total } = await loadSuppressedAddresses({ ...sp, page: String(page), size: "100" });
    for (const r of rows) {
      lines.push(
        [r.address, r.channel, r.reason, r.scope, r.source, r.campaignName, new Date(r.createdAt).toISOString()].map(cell).join(","),
      );
    }
    if (rows.length === 0 || lines.length - 1 >= total) break;
  }
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="unsubscribed.csv"' },
  });
});
