import { Suspense } from "react";
import { and, like, or } from "drizzle-orm";
import { CoinsIcon, ScaleIcon, ScrollTextIcon, ShoppingBagIcon, WalletIcon } from "lucide-react";
import { db } from "@/db/client";
import { unexpired } from "@foundry/wallet";
import { walletLedger, orders } from "@/db/schema";
import { parseSort, type SortState } from "@foundry/design-system/list-sort";
import { parseFilterState, SectionCard, type FacetDef } from "@/components/ds";
import { StatCards, StatCardsSkeleton, type StatCardItem } from "@/components/dashboard/stat-cards";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { epochRange, withDefaultMonth, withListDates } from "@/lib/list/default-month";
import { LedgerTable, LedgerTableSkeleton } from "./ledger-table";
import { eventLabel } from "@relay/engine/ui/template-status";
import { walletEntryLabel } from "@/lib/wallet/source-labels";
import { formatEpoch } from "@/lib/format/datetime";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { walletLedgerRows, walletLedgerStats, type WalletSortColumn } from "@/lib/wallet/wallet-ledger.service";

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
  const sp = await withDefaultMonth(await searchParams);
  const { agg } = await walletLedgerStats(epochRange(sp));
  const cards: StatCardItem[] = [
    { label: "Coins earned", value: agg.earned.toLocaleString(), icon: CoinsIcon, hint: "in selected range" },
    { label: "Coins spent", value: agg.spent.toLocaleString(), icon: ShoppingBagIcon, hint: "net of returns" },
    { label: "Net", value: (agg.earned - agg.spent).toLocaleString(), icon: ScaleIcon, hint: "earned minus spent" },
    { label: "Active wallets", value: agg.wallets.toLocaleString(), icon: WalletIcon, hint: "with activity in range" },
    { label: "Entries", value: agg.entries.toLocaleString(), icon: ScrollTextIcon, hint: "ledger rows in range", href: `/dashboard/wallet/ledger?from=${sp.from}&to=${sp.to}` },
  ];
  return <StatCards items={cards} />;
}

/**
 * Exported for its test: these are raw aggregate queries over `wallet_ledger`
 * that bypass `walletService`, so the `unexpired()` filter they need is easy
 * to lose and impossible to notice from the rendered card.
 */
async function WalletLedgerData({ searchParams }: { searchParams: SearchParams }) {
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
        whoHref: r.userPublicId ? `/dashboard/customers/${r.userPublicId}/wallet` : null,
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
