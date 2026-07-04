import { Suspense } from "react";
import { and, eq, isNull, like, not, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox } from "@/db/schema";
import { Skeleton } from "@/components/ui/skeleton";

const intCount = sql<number>`cast(count(*) as int)`;

async function count(where?: SQL): Promise<number> {
  const [row] = await db.select({ n: intCount }).from(notificationOutbox).where(where);
  return row?.n ?? 0;
}

// Single source of truth for the stat cards. The real grid and its skeleton
// twin both render from this, so the loading state can't drift from the cards.
const STAT_CARDS = [
  { key: "total", label: "Total queued" },
  { key: "sent", label: "Delivered" },
  { key: "skipped", label: "Skipped (no template)" },
  { key: "failed", label: "Failed" },
  { key: "inFlight", label: "In flight" },
] as const;

type StatKey = (typeof STAT_CARDS)[number]["key"];

function StatCards({ values }: { values: Record<StatKey, number> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {STAT_CARDS.map((s) => (
        <div key={s.key} className="rounded-lg border p-4">
          <div className="text-2xl font-semibold tabular-nums">{values[s.key]}</div>
          <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

StatCards.Skeleton = function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {STAT_CARDS.map((s) => (
        <div key={s.key} className="rounded-lg border p-4">
          <Skeleton className="h-8 w-12" />
          <Skeleton className="mt-2 h-3 w-full max-w-24" />
        </div>
      ))}
    </div>
  );
};

function ChannelList({ rows }: { rows: { channel: string; n: number }[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {rows.map((c) => (
        <li key={c.channel} className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{c.channel}</span>
          <span className="tabular-nums font-medium">{c.n}</span>
        </li>
      ))}
    </ul>
  );
}

ChannelList.Skeleton = function ChannelListSkeleton() {
  return (
    <ul className="space-y-1.5">
      {Array.from({ length: 4 }).map((_, r) => (
        <li key={r} className="flex items-center justify-between text-sm">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-8" />
        </li>
      ))}
    </ul>
  );
};

export default function NotificationAnalyticsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<StatCards.Skeleton />}>
        <StatsData />
      </Suspense>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-medium">By channel</h2>
        <Suspense fallback={<ChannelList.Skeleton />}>
          <ByChannelData />
        </Suspense>
      </div>
    </div>
  );
}

async function StatsData() {
  const SKIPPED = like(notificationOutbox.lastError, "skipped%");

  const [total, sent, skipped, failed, inFlight] = await Promise.all([
    count(undefined),
    count(and(eq(notificationOutbox.status, "sent"), isNull(notificationOutbox.lastError))),
    count(and(eq(notificationOutbox.status, "sent"), SKIPPED)),
    count(eq(notificationOutbox.status, "failed")),
    count(not(sql`${notificationOutbox.status} in ('sent','failed')`)),
  ]);

  return <StatCards values={{ total, sent, skipped, failed, inFlight }} />;
}

async function ByChannelData() {
  const byChannel = await db
    .select({ channel: notificationOutbox.channel, n: intCount })
    .from(notificationOutbox)
    .groupBy(notificationOutbox.channel);

  return <ChannelList rows={byChannel} />;
}
