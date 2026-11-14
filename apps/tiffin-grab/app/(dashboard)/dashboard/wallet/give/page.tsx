import { Suspense } from "react";
import { CoinsIcon, GiftIcon, UserCheckIcon, UsersIcon, WalletIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { parseFilterState, SectionCard, type FacetDef } from "@/components/ds";
import { StatCards, StatCardsSkeleton, type StatCardItem } from "@/components/dashboard/stat-cards";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { parseSort } from "@foundry/design-system/list-sort";
import { epochRange, withDefaultMonth, withListDates } from "@/lib/list/default-month";
import { formatEpoch } from "@/lib/format/datetime";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { findCustomerGroup, giveCoinsStats, giveFilterOptions, giveHistoryRows, type GiveSortColumn } from "@/lib/customer-groups/customer-groups.service";
import { MAX_REVIEW_ROWS, listOrderCities } from "@/lib/services/customer-payouts.service";
import { GiveHistoryTable, GiveHistoryTableSkeleton } from "./give-history-table";
import { GiveCoinsFlowDialog } from "./give-coins-flow-dialog";
import { GiveOneCustomerDialog } from "./give-one-customer-dialog";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function GiveCoinsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const query = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1])).toString();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionDateRange />
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={<Skeleton className="h-9 w-56" />}>
              <Launcher searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
        <Suspense fallback={<StatCardsSkeleton count={5} />}>
          <GiveStats searchParams={searchParams} />
        </Suspense>
      </div>
      <SectionCard
        title="Grant history"
        subtitle="Every coin grant, with the staff member who gave it."
        action={
          <a className="text-sm underline underline-offset-2" href={`/api/wallet/give/export?${query}`}>
            Export CSV
          </a>
        }
      >
        <Suspense fallback={<GiveHistoryTableSkeleton />}>
          <GrantHistory searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function Launcher({ searchParams }: { searchParams: SearchParams }) {
  const groupId = (await searchParams).group;
  const preset = groupId ? await findCustomerGroup(groupId) : null;
  return (
    <>
      {groupId && !preset && (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>That customer group was not found. Pick a group below.</AlertDescription>
        </Alert>
      )}
      <GiveOneCustomerDialog />
      <GiveCoinsFlowDialog
        cities={await listOrderCities()}
        maxRows={MAX_REVIEW_ROWS}
        presetGroup={preset ? { publicId: preset.publicId, count: preset.memberCount } : null}
      />
    </>
  );
}

async function GiveStats({ searchParams }: { searchParams: SearchParams }) {
  const sp = await withDefaultMonth(await searchParams);
  const stats = await giveCoinsStats(epochRange(sp));
  const cards: StatCardItem[] = [
    { label: "Coins given", value: stats.coinsGiven.toLocaleString(), icon: CoinsIcon, hint: "in selected range" },
    { label: "Customers rewarded", value: stats.customersRewarded.toLocaleString(), icon: UserCheckIcon, hint: "received at least one grant" },
    { label: "Grants", value: stats.grants.toLocaleString(), icon: GiftIcon, hint: "one per Give coins action" },
    { label: "Groups", value: stats.groups.toLocaleString(), icon: UsersIcon, hint: "created in range", href: `/dashboard/customer-groups?from=${sp.from}&to=${sp.to}` },
    {
      label: "Avg coins per customer",
      value: stats.avgCoinsPerCustomer.toFixed(1),
      icon: WalletIcon,
      hint: "coins per rewarded customer",
    },
  ];
  return <StatCards items={cards} />;
}

const TYPE_LABEL = { group: "Group grant", one: "One customer" } as const;

// `group` is the Launcher preselect param, so the Group facet uses `inGroup`.
// A text search spans all dates (withListDates), like Orders.
async function GrantHistory({ searchParams }: { searchParams: SearchParams }) {
  const sp = await withListDates(await searchParams);
  const range = epochRange(sp);
  const sort = parseSort<GiveSortColumn>(
    sp,
    ["when", "customer", "coins", "type", "group", "givenBy", "memo"],
    { column: "when", dir: "desc" },
  );
  const spec0: FacetDef[] = [{ kind: "search", fields: ["customer"] }];
  const { page } = parseFilterState(spec0, sp);
  const type = sp.type === "group" || sp.type === "one" ? sp.type : undefined;
  const [{ rows, total }, { timezone }, { givers, groups }] = await Promise.all([
    giveHistoryRows({ q: sp.q, type, givenBy: sp.givenBy || undefined, group: sp.inGroup || undefined, range, sort, page }),
    getAppSettings(),
    giveFilterOptions(),
  ]);
  const spec: FacetDef[] = [
    { kind: "select", field: "givenBy", label: "Given by", options: givers.map((g) => ({ value: g.value, label: g.label ?? "Unnamed" })) },
    { kind: "select", field: "type", label: "Type", options: [{ value: "group", label: TYPE_LABEL.group }, { value: "one", label: TYPE_LABEL.one }] },
    { kind: "select", field: "inGroup", label: "Group", options: groups },
    ...spec0,
  ];

  return (
    <GiveHistoryTable
      spec={spec}
      sort={sort}
      total={total}
      page={page.page}
      size={page.size}
      rows={rows.map((r) => ({
        publicId: r.publicId,
        when: formatEpoch(r.createdAt, { mode: "datetime", timeZone: timezone }),
        customer: r.customer,
        customerPublicId: r.customerPublicId,
        coins: r.coins,
        type: TYPE_LABEL[r.type],
        group: r.group,
        groupPublicId: r.groupPublicId,
        // Grants saved before 2026-10-28 never recorded who gave them.
        givenBy: r.givenBy ?? "Not recorded",
        memo: r.memo,
      }))}
    />
  );
}
