import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { parseFilterState } from "@/components/ds";
import { formatEpoch } from "@/lib/format/datetime";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { listCoinGrantGroups } from "@/lib/services/coin-grants.service";
import { GroupsTable, GroupsTableSkeleton } from "./groups-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function GroupsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<GroupsTableSkeleton />}>
      <GroupsData searchParams={searchParams} />
    </Suspense>
  );
}

async function GroupsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page } = parseFilterState([], sp);
  const [{ rows, total }, { timezone }] = await Promise.all([listCoinGrantGroups(page), getAppSettings()]);
  return (
    <GroupsTable
      rows={rows.map((g) => ({
        ...g,
        when: formatEpoch(g.createdAt, { mode: "datetime", timeZone: timezone }),
      }))}
      total={total}
      page={page.page}
      size={page.size}
    />
  );
}
