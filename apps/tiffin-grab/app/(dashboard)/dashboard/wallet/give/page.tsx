import { Suspense } from "react";
import { CoinsIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { WalletLedgerTable, WalletLedgerTableSkeleton } from "@foundry/crm";
import { SkeletonStatCards, StatGrid, parseFilterState } from "@/components/ds";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { parseSort, type SortState } from "@/lib/list/sort";
import { epochRange, withDefaultMonth } from "@/lib/list/default-month";
import { formatEpoch } from "@/lib/format/datetime";
import { walletEntryLabel } from "@/lib/wallet/source-labels";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { giveCoinsStats } from "@/lib/services/customer-groups.service";
import { MAX_REVIEW_ROWS, listOrderCities } from "@/lib/services/customer-payouts.service";
import { walletLedgerRows, type WalletSortColumn } from "../ledger/page";
import { GiveCoinsFlowDialog } from "./give-coins-flow-dialog";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function GiveCoinsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-2">
        <h2 className="text-base font-semibold">Give coins</h2>
        <p className="text-muted-foreground text-sm">Coins are given to a customer group. Pick or create a group, then give each member coins.</p>
        <Suspense fallback={<Button disabled><CoinsIcon /> Give coins</Button>}>
          <Launcher />
        </Suspense>
      </div>
      <SectionDateRange />
      <Suspense
        fallback={
          <>
            <SkeletonStatCards count={5} className="md:grid-cols-2 lg:grid-cols-5" />
            <WalletLedgerTableSkeleton />
          </>
        }
      >
        <GrantHistory searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Launcher() {
  await requireAdmin();
  return <GiveCoinsFlowDialog cities={await listOrderCities()} maxRows={MAX_REVIEW_ROWS} />;
}

// Cards and every past Give coins grant (with the staff member who saved it) follow
// the date range. Grants never carry an order, so the order column holds "Given by".
async function GrantHistory({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await withDefaultMonth(await searchParams);
  const range = epochRange(sp);
  const sort: SortState<WalletSortColumn> = parseSort(
    sp,
    ["time", "user", "event", "source", "coins", "order", "memo"],
    { column: "time", dir: "desc" },
  );
  const { page } = parseFilterState([], sp);
  const [stats, { rows, total }, { timezone }] = await Promise.all([
    giveCoinsStats(range),
    walletLedgerRows({ q: sp.q?.trim(), sourceType: "manual_broadcast", range, sort, page }),
    getAppSettings(),
  ]);

  return (
    <>
      <StatGrid
        cols={5}
        items={[
          { label: "Coins given", value: stats.coinsGiven.toLocaleString() },
          { label: "Customers rewarded", value: stats.customersRewarded.toLocaleString() },
          { label: "Grants", value: stats.grants.toLocaleString() },
          { label: "Groups", value: stats.groups.toLocaleString() },
          { label: "Avg coins per customer", value: stats.avgCoinsPerCustomer.toFixed(1) },
        ]}
      />
      <WalletLedgerTable
        orderColumnLabel="Given by"
        rows={rows.map((r) => ({
          publicId: r.publicId,
          when: formatEpoch(r.createdAt, { mode: "datetime", timeZone: timezone }),
          direction: r.direction,
          eventLabel: null,
          sourceType: walletEntryLabel(r.sourceType),
          coins: r.coins,
          memo: r.memo,
          who: r.email,
          // Grants saved before 2026-10-28 never recorded who gave them.
          orderLabel: r.actorName ?? "Not recorded",
          orderHref: null,
        }))}
        sort={sort}
        total={total}
        page={page.page}
        size={page.size}
      />
    </>
  );
}
