import { and, eq, isNull, like, not, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox } from "@/db/schema";

const intCount = sql<number>`cast(count(*) as int)`;

async function count(where?: SQL): Promise<number> {
  const [row] = await db.select({ n: intCount }).from(notificationOutbox).where(where);
  return row?.n ?? 0;
}

export default async function NotificationAnalyticsPage() {
  const SKIPPED = like(notificationOutbox.lastError, "skipped%");

  const [total, sent, skipped, failed, inFlight, byChannel] = await Promise.all([
    count(undefined),
    count(and(eq(notificationOutbox.status, "sent"), isNull(notificationOutbox.lastError))),
    count(and(eq(notificationOutbox.status, "sent"), SKIPPED)),
    count(eq(notificationOutbox.status, "failed")),
    count(not(sql`${notificationOutbox.status} in ('sent','failed')`)),
    db
      .select({ channel: notificationOutbox.channel, n: intCount })
      .from(notificationOutbox)
      .groupBy(notificationOutbox.channel),
  ]);

  const stats = [
    { label: "Total queued", value: total },
    { label: "Delivered", value: sent },
    { label: "Skipped (no template)", value: skipped },
    { label: "Failed", value: failed },
    { label: "In flight", value: inFlight },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border p-4">
            <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-medium">By channel</h2>
        {byChannel.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {byChannel.map((c) => (
              <li key={c.channel} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{c.channel}</span>
                <span className="tabular-nums font-medium">{c.n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
