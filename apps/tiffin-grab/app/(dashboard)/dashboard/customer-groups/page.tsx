import { Suspense } from "react";
import { CoinsIcon, MailIcon, UserRoundIcon, UsersIcon, ZapIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageShell, PageHeader, SectionCard, parseFilterState } from "@/components/ds";
import { StatCards, StatCardsSkeleton, type StatCardItem } from "@/components/dashboard/stat-cards";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { epochRange, withDefaultMonth } from "@/lib/list/default-month";
import { customerGroupStats, listCustomerGroups } from "@/lib/services/customer-groups.service";
import { GroupsTable, GroupsTableSkeleton } from "./groups-table";
import { NewGroupButtonSkeleton, NewGroupLauncher } from "./new-group-launcher";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function CustomerGroupsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader
        icon={UsersIcon}
        title="Customer groups"
        actions={
          <Suspense fallback={<NewGroupButtonSkeleton />}>
            <NewGroupLauncher />
          </Suspense>
        }
      />
      <SectionDateRange />
      <Suspense
        fallback={
          <>
            <StatCardsSkeleton count={5} />
            <SectionCard title="All groups"><GroupsTableSkeleton /></SectionCard>
          </>
        }
      >
        <GroupsData searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function GroupsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await withDefaultMonth(await searchParams);
  const range = epochRange(sp);
  const { page } = parseFilterState([], sp);
  const [stats, { rows, total }] = await Promise.all([
    customerGroupStats(range),
    listCustomerGroups({ page: page.page, size: page.size, range }),
  ]);
  const cards: StatCardItem[] = [
    { label: "Groups", value: stats.groups.toLocaleString(), icon: UsersIcon, hint: "created in selected range" },
    {
      label: "Members",
      value: stats.members.toLocaleString(),
      icon: UserRoundIcon,
      hint: stats.groups ? `avg ${Math.round(stats.members / stats.groups)} per group` : "no groups in range",
    },
    { label: "Actions", value: stats.actions.toLocaleString(), icon: ZapIcon, hint: "coins, emails and coupons" },
    { label: "Coins via groups", value: stats.coinsViaGroups.toLocaleString(), icon: CoinsIcon, hint: "awarded to members" },
    { label: "Emails sent", value: stats.emailsSent.toLocaleString(), icon: MailIcon, hint: "campaigns made from groups" },
  ];

  return (
    <>
      <StatCards items={cards} />
      <SectionCard title="All groups" subtitle="Saved sets of customers. Pick one from Give coins, Campaigns or Coupons to act on it.">
        <GroupsTable rows={rows} total={total} page={page.page} size={page.size} />
      </SectionCard>
    </>
  );
}
