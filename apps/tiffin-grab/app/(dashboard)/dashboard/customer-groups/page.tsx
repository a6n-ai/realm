import { Suspense } from "react";
import { UsersIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageShell, PageHeader, SectionCard, SkeletonStatCards, StatGrid, parseFilterState } from "@/components/ds";
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
            <SkeletonStatCards count={5} className="md:grid-cols-2 lg:grid-cols-5" />
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
  return (
    <>
      <StatGrid
        cols={5}
        items={[
          { label: "Groups", value: stats.groups.toLocaleString() },
          { label: "Members", value: stats.members.toLocaleString() },
          { label: "Actions", value: stats.actions.toLocaleString() },
          { label: "Coins via groups", value: stats.coinsViaGroups.toLocaleString() },
          { label: "Emails sent", value: stats.emailsSent.toLocaleString() },
        ]}
      />
      <SectionCard title="All groups" subtitle="Saved sets of customers. Give them coins, email them or apply a coupon in one go.">
        <GroupsTable rows={rows} total={total} page={page.page} size={page.size} />
      </SectionCard>
    </>
  );
}
