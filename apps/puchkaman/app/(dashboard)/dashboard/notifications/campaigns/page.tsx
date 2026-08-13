import { Suspense } from "react";
import Link from "next/link";
import { asc, count, desc } from "drizzle-orm";
import { columnResolver, conditionToSql } from "@realm/database";
import { SectionCard, parseFilterState, type FacetDef } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { campaign } from "@/db/schema";
import { parseSort, type SortState } from "@/lib/list/sort";
import { CampaignsTable, CampaignsTableSkeleton, type CampaignRow } from "./campaigns-table";

const SORT_COL = {
  name: campaign.name,
  status: campaign.status,
  createdAt: campaign.createdAt,
} as const;

type CampaignSortColumn = keyof typeof SORT_COL;

const SPEC: FacetDef[] = [
  { kind: "search", fields: ["name"] },
  {
    kind: "pills",
    field: "status",
    label: "Status",
    options: [
      { value: "draft", label: "Draft" },
      { value: "scheduled", label: "Scheduled" },
      { value: "sending", label: "Sending" },
      { value: "sent", label: "Sent" },
      { value: "paused", label: "Paused" },
      { value: "cancelled", label: "Cancelled" },
    ],
  },
  { kind: "dateRange", field: "createdAt", label: "Created" },
];

type SearchParams = Promise<Record<string, string | undefined>>;

export default function CampaignsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <SectionCard
      title="Campaigns"
      subtitle="Marketing sends. Every message carries an unsubscribe link and the sender's postal address."
      action={
        <Button asChild size="sm">
          <Link href="/dashboard/notifications/campaigns/new">New campaign</Link>
        </Button>
      }
    >
      <Suspense fallback={<CampaignsTableSkeleton />}>
        <CampaignsData searchParams={searchParams} />
      </Suspense>
    </SectionCard>
  );
}

async function CampaignsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;

  const sort: SortState<CampaignSortColumn> = parseSort(sp, ["name", "status", "createdAt"], {
    column: "createdAt",
    dir: "desc",
  });
  const { condition, page } = parseFilterState(SPEC, sp);
  const where = conditionToSql(
    condition,
    columnResolver({ name: campaign.name, status: campaign.status, createdAt: campaign.createdAt }),
  );

  const col = SORT_COL[sort.column];
  const orderBy = sort.dir === "asc" ? asc(col) : desc(col);

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        publicId: campaign.publicId,
        name: campaign.name,
        channels: campaign.channels,
        status: campaign.status,
        scheduledAt: campaign.scheduledAt,
        sentAt: campaign.sentAt,
        counts: campaign.counts,
        createdAt: campaign.createdAt,
      })
      .from(campaign)
      .where(where)
      .orderBy(orderBy)
      .limit(page.size)
      .offset(page.page * page.size),
    db.select({ n: count() }).from(campaign).where(where),
  ]);

  return (
    <CampaignsTable
      spec={SPEC}
      rows={rows as CampaignRow[]}
      sort={sort}
      total={Number(totalRow?.n ?? 0)}
      page={page.page}
      size={page.size}
    />
  );
}

export type { CampaignSortColumn };
