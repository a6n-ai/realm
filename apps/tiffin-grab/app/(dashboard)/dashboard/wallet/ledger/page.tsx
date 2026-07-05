import { Suspense } from "react";
import { asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { walletLedger, users, orders } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { parseSort, type SortState } from "@/lib/list/sort";
import { SkeletonStatCards } from "@/components/ds";
import { LedgerTable, LedgerTableSkeleton } from "./ledger-table";

const SORT_COL = {
  time: walletLedger.createdAt,
  user: users.email,
  event: walletLedger.eventType,
  source: walletLedger.sourceType,
  coins: walletLedger.coins,
  order: orders.publicId,
  memo: walletLedger.memo,
} as const;

type WalletSortColumn = keyof typeof SORT_COL;

type SearchParams = Promise<{ q?: string; sort?: string; dir?: string }>;

export default function WalletLedgerPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={5} />}>
        <WalletStatsData />
      </Suspense>

      <Suspense fallback={<LedgerTableSkeleton />}>
        <WalletLedgerData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function WalletStatsData() {
  await requireAdmin();

  const coinsIf = (dir: "credit" | "debit") =>
    sql<number>`cast(coalesce(sum(case when ${walletLedger.direction} = ${dir} then ${walletLedger.coins} else 0 end), 0) as int)`;

  const [agg] = await db
    .select({
      credited: coinsIf("credit"),
      redeemed: coinsIf("debit"),
      entries: sql<number>`cast(count(*) as int)`,
      wallets: sql<number>`cast(count(distinct ${walletLedger.userId}) as int)`,
    })
    .from(walletLedger);

  const stats = [
    { label: "Coins credited", value: agg.credited.toLocaleString() },
    { label: "Coins redeemed", value: agg.redeemed.toLocaleString() },
    { label: "Net outstanding", value: (agg.credited - agg.redeemed).toLocaleString() },
    { label: "Active wallets", value: agg.wallets.toLocaleString() },
    { label: "Entries", value: agg.entries.toLocaleString() },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border p-4">
          <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

async function WalletLedgerData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const sp = await searchParams;

  const sort: SortState<WalletSortColumn> = parseSort(
    sp,
    ["time", "user", "event", "source", "coins", "order", "memo"],
    { column: "time", dir: "desc" },
  );

  const q = sp.q?.trim();
  const where: SQL | undefined = q
    ? or(
        ilike(walletLedger.memo, `%${q}%`),
        ilike(users.email, `%${q}%`),
        sql`${walletLedger.eventType}::text ilike ${`%${q}%`}`,
        sql`${walletLedger.sourceType}::text ilike ${`%${q}%`}`,
        ilike(orders.publicId, `%${q}%`),
      )
    : undefined;

  const col = SORT_COL[sort.column];
  const orderBy = sort.dir === "asc" ? asc(col) : desc(col);

  const rows = await db
    .select({
      publicId: walletLedger.publicId,
      createdAt: walletLedger.createdAt,
      direction: walletLedger.direction,
      eventType: walletLedger.eventType,
      sourceType: walletLedger.sourceType,
      coins: walletLedger.coins,
      memo: walletLedger.memo,
      email: users.email,
      orderPublicId: orders.publicId,
    })
    .from(walletLedger)
    .leftJoin(users, eq(users.id, walletLedger.userId))
    .leftJoin(orders, eq(orders.id, walletLedger.orderId))
    .where(where)
    .orderBy(orderBy)
    .limit(100);

  return <LedgerTable rows={rows} sort={sort} />;
}

export type { WalletSortColumn };
