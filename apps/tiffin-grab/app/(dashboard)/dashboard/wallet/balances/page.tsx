import { Suspense } from "react";
import { CoinsIcon, TrendingDownIcon, TrendingUpIcon, WalletIcon, BanknoteIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { parseFilterState, SectionCard, type FacetDef } from "@/components/ds";
import { StatCards, StatCardsSkeleton, type StatCardItem } from "@/components/dashboard/stat-cards";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { parseSort, type SortState } from "@/lib/list/sort";
import { epochRange, withDefaultMonth } from "@/lib/list/default-month";
import { formatEpoch } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { getAppSettings } from "@/lib/services/app-settings.service";
import {
  listWalletBalances,
  walletBalanceStats,
  type BalanceFilter,
  type BalanceSortColumn,
} from "@/lib/services/wallet-balances.service";
import { BalancesTable, BalancesTableSkeleton } from "./balances-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const SPEC: FacetDef[] = [
  {
    kind: "select",
    field: "balance",
    label: "Balance",
    options: [
      { value: "has", label: "Has balance" },
      { value: "zero", label: "Zero" },
    ],
  },
  { kind: "search", fields: ["name", "email", "phone"] },
];

export default function WalletBalancesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionDateRange />
        </div>
        <Suspense fallback={<StatCardsSkeleton count={5} />}>
          <BalancesStats searchParams={searchParams} />
        </Suspense>
      </div>
      <SectionCard title="Balances" subtitle="Balance figures are as of now; the date range moves Earned and Redeemed.">
        <Suspense fallback={<BalancesTableSkeleton />}>
          <BalancesData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function BalancesStats({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await withDefaultMonth(await searchParams);
  const [stats, { currency }] = await Promise.all([walletBalanceStats(epochRange(sp)), getAppSettings()]);
  const cards: StatCardItem[] = [
    { label: "Coins outstanding", value: stats.outstanding.toLocaleString(), icon: CoinsIcon, hint: "held by customers now" },
    { label: "Money value", value: stats.value == null ? "—" : formatMoney(Math.round(stats.value * 100), currency), icon: BanknoteIcon, hint: "at the current coin rate" },
    { label: "Wallets with a balance", value: stats.walletsWithBalance.toLocaleString(), icon: WalletIcon, hint: "holding coins now" },
    { label: "Coins earned", value: stats.earned.toLocaleString(), icon: TrendingUpIcon, hint: "in selected range" },
    { label: "Coins redeemed", value: stats.redeemed.toLocaleString(), icon: TrendingDownIcon, hint: "in selected range" },
  ];
  return <StatCards items={cards} />;
}

// Balance figures are as of now; the date range only moves Earned and Redeemed.
async function BalancesData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await withDefaultMonth(await searchParams);
  const range = epochRange(sp);
  const sort: SortState<BalanceSortColumn> = parseSort(
    sp,
    ["customer", "balance", "value", "earned", "redeemed", "last"],
    { column: "balance", dir: "desc" },
  );
  const { page } = parseFilterState(SPEC, sp);
  const filter: BalanceFilter | undefined = sp.balance === "has" || sp.balance === "zero" ? sp.balance : undefined;

  const [{ rows, total }, { timezone, currency }] = await Promise.all([
    listWalletBalances({ q: sp.q?.trim(), filter, sort, page, range }),
    getAppSettings(),
  ]);
  const money = (v: number | null) => (v == null ? "—" : formatMoney(Math.round(v * 100), currency));

  return (
      <BalancesTable
        spec={SPEC}
        sort={sort}
        total={total}
        page={page.page}
        size={page.size}
        rows={rows.map((r) => ({
          publicId: r.publicId,
          name: r.name || r.email,
          email: r.email,
          phone: r.phone,
          balance: r.balance,
          value: money(r.value),
          earned: r.earned,
          redeemed: r.redeemed,
          last: formatEpoch(r.last, { mode: "date", timeZone: timezone }),
        }))}
      />
  );
}
