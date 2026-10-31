import { Suspense } from "react";
import { and, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { CoinsIcon, ScaleIcon, ScrollTextIcon, ShoppingBagIcon, WalletIcon } from "lucide-react";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { earnedCoinsSql, spentCoinsSql, unexpired } from "@foundry/wallet";
import { walletLedger, users, orders } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { parseSort, type SortState } from "@/lib/list/sort";
import { parseFilterState, SectionCard, type FacetDef } from "@/components/ds";
import { StatCards, StatCardsSkeleton, type StatCardItem } from "@/components/dashboard/stat-cards";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { epochRange, withDefaultMonth, withListDates } from "@/lib/list/default-month";
import { pageOrder } from "@foundry/database";
import { LedgerTable, LedgerTableSkeleton } from "./ledger-table";
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionDateRange />
        </div>
        <Suspense fallback={<StatCardsSkeleton count={5} />}>
          <LedgerStats searchParams={searchParams} />
        </Suspense>
      </div>
      <SectionCard title="Ledger" subtitle="Every coin earned, redeemed or given. A text search spans all dates.">
        <Suspense fallback={<LedgerTableSkeleton />}>
          <WalletLedgerData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function LedgerStats({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await withDefaultMonth(await searchParams);
  const { agg } = await walletLedgerStats(epochRange(sp));
  const cards: StatCardItem[] = [
    { label: "Coins earned", value: agg.earned.toLocaleString(), icon: CoinsIcon, hint: "in selected range" },
    { label: "Coins spent", value: agg.spent.toLocaleString(), icon: ShoppingBagIcon, hint: "net of returns" },
    { label: "Net", value: (agg.earned - agg.spent).toLocaleString(), icon: ScaleIcon, hint: "earned minus spent" },
    { label: "Active wallets", value: agg.wallets.toLocaleString(), icon: WalletIcon, hint: "with activity in range" },
    { label: "Entries", value: agg.entries.toLocaleString(), icon: ScrollTextIcon, hint: "ledger rows in range" },
  ];
  return <StatCards items={cards} />;
}

/**
 * Exported for its test: these are raw aggregate queries over `wallet_ledger`
 * that bypass `walletService`, so the `unexpired()` filter they need is easy
 * to lose and impossible to notice from the rendered card.
 */
export async function walletLedgerStats(range: { from: number; to: number } = { from: 0, to: Number.MAX_SAFE_INTEGER }) {
  const [agg] = await db
    .select({
      earned: earnedCoinsSql(walletLedger),
      spent: spentCoinsSql(walletLedger),
      entries: sql<number>`cast(count(*) as int)`,
      wallets: sql<number>`cast(count(distinct ${walletLedger.userId}) as int)`,
    })
    // Lapsed holds never spent anything, so they are not earned, not
    // spent, and not entries — same rule walletService.balance() applies.
    .from(walletLedger)
    .where(and(unexpired(walletLedger, Date.now()), gte(walletLedger.createdAt, range.from), lte(walletLedger.createdAt, range.to)));

  return { agg };
}

/**
 * Exported for its test, same reason as walletLedgerStats: a lapsed hold must
 * not show as a debit here while the balance ignores it (it reads as a second
 * debit next to the re-collect row).
 */
const actor = alias(users, "actor");

export async function walletLedgerRows({ q, sourceType, direction, range, sort, page }: {
  q?: string;
  /** Narrows to entries created inside the window (epoch-ms, inclusive). */
  range?: { from: number; to: number };
  /** Narrows to one source, e.g. the Give coins history (`manual_broadcast`). */
  sourceType?: string;
  direction?: "credit" | "debit";
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
  const where = and(
    unexpired(walletLedger, Date.now()),
    search,
    sourceType ? eq(walletLedger.sourceType, sourceType) : undefined,
    direction ? eq(walletLedger.direction, direction) : undefined,
    range ? and(gte(walletLedger.createdAt, range.from), lte(walletLedger.createdAt, range.to)) : undefined,
  );

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
        actorName: actor.name,
      })
      .from(walletLedger)
      .leftJoin(users, eq(users.id, walletLedger.userId))
      .leftJoin(orders, eq(orders.id, walletLedger.orderId))
      .leftJoin(actor, eq(actor.id, walletLedger.createdBy))
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

  // A text search spans all dates, like Orders; the cards above keep the picked range.
  const sp = await withListDates(await searchParams);
  const range = epochRange(sp);

  const sort: SortState<WalletSortColumn> = parseSort(
    sp,
    ["time", "user", "event", "source", "coins", "order", "memo"],
    { column: "time", dir: "desc" },
  );
  const direction = sp.direction === "credit" || sp.direction === "debit" ? sp.direction : undefined;

  const spec0: FacetDef[] = [{ kind: "search", fields: ["memo", "user", "source", "order"] }];
  const { page } = parseFilterState(spec0, sp);

  const [{ rows, total }, { timezone }, sources] = await Promise.all([
    walletLedgerRows({ q: sp.q?.trim(), sourceType: sp.source || undefined, direction, range, sort, page }),
    getAppSettings(),
    db.selectDistinct({ sourceType: walletLedger.sourceType }).from(walletLedger),
  ]);

  const spec: FacetDef[] = [
    {
      kind: "select",
      field: "source",
      label: "Source",
      options: sources
        .map((s) => ({ value: s.sourceType, label: walletEntryLabel(s.sourceType) }))
        .sort((x, y) => x.label.localeCompare(y.label)),
    },
    {
      kind: "select",
      field: "direction",
      label: "Direction",
      options: [
        { value: "credit", label: "Credit" },
        { value: "debit", label: "Debit" },
      ],
    },
    ...spec0,
  ];

  return (
    <LedgerTable
      spec={spec}
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
