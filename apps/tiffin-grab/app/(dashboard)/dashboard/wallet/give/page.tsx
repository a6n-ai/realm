import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { Skeleton } from "@foundry/ui/skeleton";
import { WalletLedgerTable, WalletLedgerTableSkeleton } from "@foundry/crm";
import { parseFilterState } from "@/components/ds";
import { parseSort, type SortState } from "@/lib/list/sort";
import { formatEpoch } from "@/lib/format/datetime";
import { walletEntryLabel } from "@/lib/wallet/source-labels";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { listOrderCities } from "@/lib/services/customer-payouts.service";
import { CustomerPayoutPanel } from "../customer-payout-panel";
import { walletLedgerRows, type WalletSortColumn } from "../ledger/page";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function GiveCoinsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <GiveCoinsData />
      </Suspense>
      <Suspense fallback={<WalletLedgerTableSkeleton />}>
        <GrantHistory searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function GiveCoinsData() {
  await requireAdmin();
  const cities = await listOrderCities();
  return <CustomerPayoutPanel cities={cities} />;
}

// Every past Give coins grant, with the staff member who saved it. Grants never
// carry an order, so the table's order column holds "Given by" instead.
async function GrantHistory({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const sort: SortState<WalletSortColumn> = parseSort(
    sp,
    ["time", "user", "event", "source", "coins", "order", "memo"],
    { column: "time", dir: "desc" },
  );
  const { page } = parseFilterState([], sp);
  const [{ rows, total }, { timezone }] = await Promise.all([
    walletLedgerRows({ q: sp.q?.trim(), sourceType: "manual_broadcast", sort, page }),
    getAppSettings(),
  ]);

  return (
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
  );
}
