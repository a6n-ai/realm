import { Suspense } from "react";
import Link from "next/link";
import { PlusIcon, UsersIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageShell, PageHeader, SectionCard, parseFilterState } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { listCustomerGroups } from "@/lib/services/customer-groups.service";
import { GroupsTable, GroupsTableSkeleton } from "./groups-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function CustomerGroupsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader
        icon={UsersIcon}
        title="Customer groups"
        actions={
          <Button asChild>
            <Link href="/dashboard/customer-groups/new"><PlusIcon /> New group</Link>
          </Button>
        }
      />
      <SectionCard title="All groups" subtitle="Saved sets of customers. Give them coins, email them or apply a coupon in one go.">
        <Suspense fallback={<GroupsTableSkeleton />}>
          <GroupsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function GroupsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { page } = parseFilterState([], await searchParams);
  const { rows, total } = await listCustomerGroups({ page: page.page, size: page.size });
  return <GroupsTable rows={rows} total={total} page={page.page} size={page.size} />;
}
