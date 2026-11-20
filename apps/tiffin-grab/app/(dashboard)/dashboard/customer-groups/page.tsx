import { Suspense } from "react";
import { CoinsIcon, MailIcon, UserRoundIcon, UsersIcon, ZapIcon } from "lucide-react";
import { can, requirePagePermission } from "@/lib/auth/guards";
import { parseFilterState, type FacetDef } from "@/components/ds";
import { StatCards, StatCardsSkeleton, type StatCardItem } from "@/components/dashboard/stat-cards";
import { CustomerGroupsChrome } from "./groups-chrome";
import { epochRange, withDefaultMonth, withListDates } from "@/lib/list/default-month";
import { customerGroupStats, listCustomerGroups } from "@/lib/customer-groups/customer-groups.service";
import { GroupsTable, GroupsTableSkeleton } from "./groups-table";
import { NewGroupLauncher } from "./new-group-launcher";
import { NewGroupButtonSkeleton } from "./new-group-button-skeleton";
import { hrefWithDates } from "@/lib/dates/range-params";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function CustomerGroupsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <CustomerGroupsChrome
      actions={
        <Suspense fallback={<NewGroupButtonSkeleton />}>
          <NewGroupLauncher />
        </Suspense>
      }
      stats={
        <Suspense fallback={<StatCardsSkeleton count={5} />}>
          <GroupsStats searchParams={searchParams} />
        </Suspense>
      }
      list={
        <Suspense fallback={<GroupsTableSkeleton />}>
          <GroupsData searchParams={searchParams} />
        </Suspense>
      }
    />
  );
}

const SPEC: FacetDef[] = [{ kind: "search", fields: ["name"] }];

async function GroupsStats({ searchParams }: { searchParams: SearchParams }) {
  await requirePagePermission({ customer: ["manage"] });
  const sp = await withDefaultMonth(await searchParams);
  const canWallet = await can({ wallet: ["read"] });
  const stats = await customerGroupStats(epochRange(sp), { wallet: canWallet });
  const cards: StatCardItem[] = [
    { label: "Groups", value: stats.groups.toLocaleString(), icon: UsersIcon, hint: "created in selected range", href: hrefWithDates("/dashboard/customer-groups", sp) },
    {
      label: "Members",
      value: stats.members.toLocaleString(),
      icon: UserRoundIcon,
      hint: stats.groups ? `avg ${Math.round(stats.members / stats.groups)} per group` : "no groups in range",
    },
    ...(canWallet
      ? [
          { label: "Actions", value: stats.actions.toLocaleString(), icon: ZapIcon, hint: "coins, emails and coupons" },
          { label: "Coins via groups", value: stats.coinsViaGroups.toLocaleString(), icon: CoinsIcon, hint: "awarded to members" },
        ]
      : []),
    { label: "Emails sent", value: stats.emailsSent.toLocaleString(), icon: MailIcon, hint: "campaigns made from groups" },
  ];

  return <StatCards items={cards} />;
}

async function GroupsData({ searchParams }: { searchParams: SearchParams }) {
  await requirePagePermission({ customer: ["manage"] });
  const sp = await withListDates(await searchParams);
  const { page } = parseFilterState(SPEC, sp);
  const { rows, total } = await listCustomerGroups({ page: page.page, size: page.size, range: epochRange(sp), q: sp.q });
  return <GroupsTable spec={SPEC} rows={rows} total={total} page={page.page} size={page.size} />;
}
