import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@foundry/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { WalletLedgerTable, WalletLedgerTableSkeleton } from "@foundry/crm";
import { parseFilterState } from "@/components/ds";
import { parseSort, type SortState } from "@/lib/list/sort";
import { formatEpoch } from "@/lib/format/datetime";
import { walletEntryLabel } from "@/lib/wallet/source-labels";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { walletLedgerRows, type WalletSortColumn } from "../ledger/page";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function GiveCoinsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-2">
        <h2 className="text-base font-semibold">Give coins</h2>
        <p className="text-muted-foreground text-sm">Coins are given to a customer group. Pick or create a group, then give each member coins from its page.</p>
        <Button asChild>
          <Link href="/dashboard/customer-groups">Give coins to a group</Link>
        </Button>
      </div>
      <Suspense fallback={<WalletLedgerTableSkeleton />}>
        <GrantHistory searchParams={searchParams} />
      </Suspense>
    </div>
  );
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
