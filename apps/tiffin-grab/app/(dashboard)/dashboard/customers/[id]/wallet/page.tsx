import { Suspense } from "react";
import { and, eq } from "drizzle-orm";
import { BanknoteIcon, CalendarClockIcon, CoinsIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { db } from "@/db/client";
import { walletLedger } from "@/db/schema";
import { parseFilterState, SectionCard, type FacetDef } from "@/components/ds";
import { StatCards, StatCardsSkeleton, type StatCardItem } from "@/components/dashboard/stat-cards";
import { parseSort, type SortState } from "@foundry/design-system/list-sort";
import { formatEpoch } from "@/lib/format/datetime";
import { formatMoney } from "@foundry/commons";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { customerWalletStats } from "@/lib/wallet/wallet-balances.service";
import { walletEntryLabel } from "@/lib/wallet/source-labels";
import { eventLabel } from "@relay/engine/ui/template-status";
import { walletLedgerRows, type WalletSortColumn } from "@/lib/wallet/wallet-ledger.service";
import { loadCustomer } from "../data";
import { requireAdmin } from "@/lib/auth/guards";
import { CustomerWalletTable, CustomerWalletTableSkeleton, type CustomerWalletColumn } from "./customer-wallet-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const SORTABLE = ["time", "event", "source", "coins", "order", "memo"] as const satisfies readonly WalletSortColumn[];

/** Wallet tab: this customer's coin balance and every ledger row behind it. */
export default function CustomerWalletPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<StatCardsSkeleton count={5} />}>
        <WalletStats params={params} />
      </Suspense>
      <SectionCard title="Wallet ledger" subtitle="Every coin earned, redeemed or given to this customer.">
        <Suspense fallback={<CustomerWalletTableSkeleton />}>
          <WalletRows params={params} searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </div>
  );
}

// Wallet data (memos, who gave coins) is admin-only, same as the Wallet section.
async function WalletStats({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const data = await loadCustomer(id);
  const [s, { currency, timezone }] = await Promise.all([customerWalletStats(data.profile.id), getAppSettings()]);
  const usd = (coins: number) => (s.rate == null ? null : formatMoney(coins * s.rate, currency));
  const cards: StatCardItem[] = [
    { label: "Balance", value: s.balance.toLocaleString(), icon: CoinsIcon, hint: usd(s.balance) ? `≈ ${usd(s.balance)}` : "coins held now" },
    { label: "Coins redeemed", value: s.redeemed.toLocaleString(), icon: TrendingDownIcon, hint: usd(s.redeemed) ? `${usd(s.redeemed)} redeemed` : "lifetime" },
    { label: "Value", value: s.value == null ? "—" : formatMoney(s.value, currency), icon: BanknoteIcon, hint: "balance at the current coin rate" },
    { label: "Coins earned", value: s.earned.toLocaleString(), icon: TrendingUpIcon, hint: usd(s.earned) ? `${usd(s.earned)} earned` : "lifetime" },
    // The wallet has no coin expiry (reserved_until only releases checkout holds), so this card shows recency instead.
    { label: "Last activity", value: s.last ? formatEpoch(s.last, { mode: "date", timeZone: timezone }) : "—", icon: CalendarClockIcon, hint: "most recent ledger entry" },
  ];
  return <StatCards items={cards} />;
}

async function WalletRows({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  await requireAdmin();
  const { id } = await params;
  const [data, sp, { timezone }] = await Promise.all([loadCustomer(id), searchParams, getAppSettings()]);
  const userId = data.profile.id;
  const sort: SortState<CustomerWalletColumn> = parseSort(sp, [...SORTABLE], { column: "time", dir: "desc" });
  const direction = sp.direction === "credit" || sp.direction === "debit" ? sp.direction : undefined;
  const search: FacetDef = { kind: "search", fields: ["memo", "source"] };
  const { page } = parseFilterState([search], sp);

  const [{ rows, total }, sources] = await Promise.all([
    walletLedgerRows({ q: sp.q?.trim(), userId, sourceType: sp.source || undefined, direction, sort, page }),
    db.selectDistinct({ sourceType: walletLedger.sourceType }).from(walletLedger).where(and(eq(walletLedger.userId, userId))),
  ]);

  const spec: FacetDef[] = [
    {
      kind: "select",
      field: "source",
      label: "Source",
      options: sources.map((s) => ({ value: s.sourceType, label: walletEntryLabel(s.sourceType) })).sort((x, y) => x.label.localeCompare(y.label)),
    },
    { kind: "select", field: "direction", label: "Direction", options: [{ value: "credit", label: "Credit" }, { value: "debit", label: "Debit" }] },
    search,
  ];

  return (
    <CustomerWalletTable
      spec={spec}
      sort={sort}
      total={total}
      page={page.page}
      size={page.size}
      rows={rows.map((r) => ({
        publicId: r.publicId,
        when: formatEpoch(r.createdAt, { mode: "datetime", timeZone: timezone }),
        direction: r.direction,
        eventLabel: r.eventType ? eventLabel(r.eventType) : null,
        sourceLabel: walletEntryLabel(r.sourceType),
        coins: r.coins,
        memo: r.memo,
        orderLabel: r.orderPublicId,
        orderHref: r.orderPublicId ? `/dashboard/orders/${r.orderPublicId}` : null,
        groupName: r.groupName,
        groupHref: r.groupPublicId ? `/dashboard/customer-groups/${r.groupPublicId}` : null,
        givenBy: r.actorName,
      }))}
    />
  );
}
