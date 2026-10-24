import { Suspense } from "react";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { earnedCoinsSql, spentCoinsSql, unexpired } from "@foundry/wallet";
import { walletLedger, users, orders } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { parseSort, type SortState } from "@/lib/list/sort";
import { SkeletonStatCards, StatGrid, parseFilterState } from "@/components/ds";
import { pageOrder } from "@foundry/database";
import { WalletLedgerTable, WalletLedgerTableSkeleton } from "@foundry/crm";
import { eventLabel } from "@relay/engine/ui/template-status";
import { walletEntryLabel } from "@/lib/wallet/source-labels";
import { formatEpoch } from "@/lib/format/datetime";
import { getAppSettings } from "@/lib/services/app-settings.service";

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

type SearchParams = Promise<Record<string, string | undefined>>;

export default function WalletLedgerPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<SkeletonStatCards count={6} />}>
        <WalletStatsData />
      </Suspense>

      <Suspense fallback={<WalletLedgerTableSkeleton />}>
        <WalletLedgerData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/**
 * Exported for its test: these are raw aggregate queries over `wallet_ledger`
 * that bypass `walletService`, so the `unexpired()` filter they need is easy
 * to lose and impossible to notice from the rendered card.
 */
export async function walletLedgerStats() {
  // Per-user current balance (credits − debits), so the highest-balance stat
  // below can rank accounts by what they hold right now, not by lifetime
  // coins earned — a customer who redeemed everything shouldn't top this.
  const balancePerUser = db
    .select({
      userId: walletLedger.userId,
      balance: sql<number>`cast(coalesce(sum(case when ${walletLedger.direction} = 'credit' then ${walletLedger.coins} else -${walletLedger.coins} end), 0) as int)`.as("balance"),
    })
    .from(walletLedger)
    .where(unexpired(walletLedger, Date.now()))
    .groupBy(walletLedger.userId)
    .as("bal");

  const [[agg], [topWallet]] = await Promise.all([
    db
      .select({
        earned: earnedCoinsSql(walletLedger),
        spent: spentCoinsSql(walletLedger),
        entries: sql<number>`cast(count(*) as int)`,
        wallets: sql<number>`cast(count(distinct ${walletLedger.userId}) as int)`,
      })
      // Lapsed holds never spent anything, so they are not earned, not
      // spent, and not entries — same rule walletService.balance() applies.
      .from(walletLedger)
      .where(unexpired(walletLedger, Date.now())),
    db
      .select({ name: users.name, email: users.email, balance: balancePerUser.balance })
      .from(balancePerUser)
      .innerJoin(users, eq(users.id, balancePerUser.userId))
      .orderBy(desc(balancePerUser.balance))
      .limit(1),
  ]);

  return { agg, topWallet };
}

async function WalletStatsData() {
  await requireAdmin();
  const { agg, topWallet } = await walletLedgerStats();

  const stats = [
    { label: "Coins earned", value: agg.earned.toLocaleString() },
    { label: "Coins spent", value: agg.spent.toLocaleString() },
    { label: "Net outstanding", value: (agg.earned - agg.spent).toLocaleString() },
    { label: "Active wallets", value: agg.wallets.toLocaleString() },
    { label: "Entries", value: agg.entries.toLocaleString() },
    {
      label: "Highest balance",
      value: (topWallet?.balance ?? 0).toLocaleString(),
      hint: topWallet ? (topWallet.name ?? topWallet.email ?? undefined) : undefined,
    },
  ];

  return <StatGrid cols={6} items={stats} />;
}

/**
 * Exported for its test, same reason as walletLedgerStats: a lapsed hold must
 * not show as a debit here while the balance ignores it (it reads as a second
 * debit next to the re-collect row).
 */
export async function walletLedgerRows({ q, sort, page }: {
  q?: string;
  sort: SortState<WalletSortColumn>;
  page: { page: number; size: number };
}) {
  const search: SQL | undefined = q
    ? or(
        ilike(walletLedger.memo, `%${q}%`),
        ilike(users.email, `%${q}%`),
        sql`${walletLedger.eventType}::text ilike ${`%${q}%`}`,
        sql`${walletLedger.sourceType}::text ilike ${`%${q}%`}`,
        ilike(orders.publicId, `%${q}%`),
      )
    : undefined;
  const live = unexpired(walletLedger, Date.now());
  const where = search ? and(live, search) : live;

  const [rows, [{ total }]] = await Promise.all([
    db
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
      .orderBy(...pageOrder(sort.dir, SORT_COL[sort.column], walletLedger.id))
      .limit(page.size)
      .offset(page.page * page.size),
    db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(walletLedger)
      .leftJoin(users, eq(users.id, walletLedger.userId))
      .leftJoin(orders, eq(orders.id, walletLedger.orderId))
      .where(where),
  ]);
  return { rows, total };
}

async function WalletLedgerData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const sp = await searchParams;

  const sort: SortState<WalletSortColumn> = parseSort(
    sp,
    ["time", "user", "event", "source", "coins", "order", "memo"],
    { column: "time", dir: "desc" },
  );
  const { page } = parseFilterState([], sp);

  const [{ rows, total }, { timezone }] = await Promise.all([
    walletLedgerRows({ q: sp.q?.trim(), sort, page }),
    getAppSettings(),
  ]);

  return (
    <WalletLedgerTable
      rows={rows.map((r) => ({
        publicId: r.publicId,
        when: formatEpoch(r.createdAt, { mode: "datetime", timeZone: timezone }),
        direction: r.direction,
        eventLabel: r.eventType ? eventLabel(r.eventType) : null,
        sourceType: walletEntryLabel(r.sourceType),
        coins: r.coins,
        memo: r.memo,
        who: r.email,
        orderLabel: r.orderPublicId,
        orderHref: r.orderPublicId ? `/dashboard/orders/${r.orderPublicId}` : null,
      }))}
      sort={sort}
      total={total}
      page={page.page}
      size={page.size}
    />
  );
}

export type { WalletSortColumn };
