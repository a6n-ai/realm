import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox } from "@/db/schema";
import { formatDateOnly, formatEpoch } from "@/lib/format/datetime";

type Run = { kind: string; key: string; started: number; recipients: number; sent: number; failed: number; opened: number };

/**
 * A system campaign's runs, read back from the dedupe key runSystemCampaign
 * writes (`cmp:<campaign>:<kind>:<key>:<user>:<channel>`) — no run table needed.
 * kind is "week" (bulk send, key = week start) or "manual" (one customer, key = time).
 */
export async function BulkRuns({ campaignId, timeZone }: { campaignId: bigint; timeZone: string }) {
  const kind = sql<string>`split_part(${notificationOutbox.dedupeKey}, ':', 3)`;
  const key = sql<string>`split_part(${notificationOutbox.dedupeKey}, ':', 4)`;
  const rows = (await db
    .select({
      kind,
      key,
      started: sql<number>`min(${notificationOutbox.createdAt})`.mapWith(Number),
      recipients: sql<number>`count(*)`.mapWith(Number),
      sent: sql<number>`count(*) filter (where ${notificationOutbox.status} = 'sent')`.mapWith(Number),
      failed: sql<number>`count(*) filter (where ${notificationOutbox.status} = 'failed')`.mapWith(Number),
      opened: sql<number>`count(${notificationOutbox.openedAt})`.mapWith(Number),
    })
    .from(notificationOutbox)
    .where(sql`${notificationOutbox.campaignId} = ${campaignId}`)
    .groupBy(kind, key)
    .orderBy(sql`min(${notificationOutbox.createdAt}) desc`)
    .limit(100)) as Run[];

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Not sent yet.</p>;

  return (
    <div className="divide-y text-sm">
      <div className="grid grid-cols-[1fr_repeat(4,4.5rem)] gap-2 pb-2 text-xs text-muted-foreground">
        <span>Run</span>
        <span className="text-right">Recipients</span>
        <span className="text-right">Sent</span>
        <span className="text-right">Opened</span>
        <span className="text-right">Failed</span>
      </div>
      {rows.map((r) => (
        <div key={`${r.kind}:${r.key}`} className="grid grid-cols-[1fr_repeat(4,4.5rem)] items-center gap-2 py-2 tabular-nums">
          <div className="min-w-0">
            <p className="font-medium">
              {r.kind === "week" ? `Week of ${formatDateOnly(r.key, { mode: "long" })}` : "Single customer"}
            </p>
            <p className="text-xs text-muted-foreground">{formatEpoch(r.started, { mode: "datetime", timeZone })}</p>
          </div>
          <span className="text-right">{r.recipients}</span>
          <span className="text-right">{r.sent}</span>
          <span className="text-right text-ok">{r.opened}</span>
          <span className={r.failed > 0 ? "text-right text-bad" : "text-right text-muted-foreground"}>{r.failed}</span>
        </div>
      ))}
    </div>
  );
}
