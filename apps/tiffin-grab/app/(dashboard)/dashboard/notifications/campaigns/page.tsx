import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { Suspense } from "react";
import { columnResolver, conditionToSql } from "@foundry/database";
import { SectionCard, StatCard, parseFilterState, type FacetDef } from "@foundry/design-system";
import { getSesSendQuota } from "@relay/email";
import { GaugeIcon } from "lucide-react";
import { NewCampaignButtons } from "./new-campaign-buttons";
import { campaign } from "@/db/schema";
import { parseSort, type SortState } from "@foundry/design-system/list-sort";
import { withListDates } from "@/lib/list/default-month";
import { findCustomerGroup } from "@/lib/customer-groups/customer-groups.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { listCampaigns, listContactListChoices, CAMPAIGN_SORT_COLUMNS, type CampaignSortColumn } from "@/lib/notifications/lists";
import { CampaignsTable, CampaignsTableSkeleton, type CampaignRow } from "./campaigns-table";
import { awsRegion } from "@/lib/runtime/env";

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
      { value: "completed", label: "Completed" },
      { value: "paused", label: "Paused" },
      { value: "cancelled", label: "Cancelled" },
    ],
  },
  { kind: "dateRange", field: "createdAt", label: "Created" },
];

type SearchParams = Promise<Record<string, string | undefined>>;

// Queued/delivered counts change from a background drainer and an async SES
// webhook — a cached render would show a stale snapshot from whenever the
// page was last built.
export const dynamic = "force-dynamic";

export default function CampaignsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <SesQuotaCard />
      </Suspense>
      <SectionCard
        title="Campaigns"
        subtitle="Marketing sends. Every message carries an unsubscribe link and the sender's postal address."
        action={
          <Suspense fallback={<NewCampaignButtons />}>
            <Buttons searchParams={searchParams} />
          </Suspense>
        }
      >
        <Suspense fallback={<CampaignsTableSkeleton />}>
          <CampaignsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function Buttons({ searchParams }: { searchParams: SearchParams }) {
  const groupId = (await searchParams).emailGroup;
  const preset = groupId ? await findCustomerGroup(groupId) : null;
  return <NewCampaignButtons presetGroup={preset} groupMissing={Boolean(groupId) && !preset} />;
}

// SES account limits, not a per-campaign figure — shown once above the list so
// an admin can see headroom before a large send. Best-effort: a missing
// ses:GetAccount permission or unset AWS_REGION renders nothing rather than
// breaking the page.
async function SesQuotaCard() {
  const quota = await getSesSendQuota({ region: awsRegion() }).catch(() => null);
  if (!quota) return null;
  const remaining = Math.max(0, quota.max24HourSend - quota.sentLast24Hours);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard
        label="SES sent (24h)"
        value={`${quota.sentLast24Hours} / ${quota.max24HourSend}`}
        icon={GaugeIcon}
        hint={quota.productionAccessEnabled ? undefined : "Sandbox — verified recipients only"}
        tone={remaining === 0 ? "bad" : undefined}
      />
      <StatCard label="Remaining today" value={remaining} icon={GaugeIcon} tone={remaining === 0 ? "bad" : "ok"} />
      <StatCard label="Max send rate" value={`${quota.maxSendRate}/s`} icon={GaugeIcon} />
    </div>
  );
}

async function CampaignsData({ searchParams }: { searchParams: SearchParams }) {
  const sp = await withListDates(await searchParams);

  const sort: SortState<CampaignSortColumn> = parseSort(sp, CAMPAIGN_SORT_COLUMNS, {
    column: "createdAt",
    dir: "desc",
  });
  const { condition, page } = parseFilterState(SPEC, sp);
  const filter = conditionToSql(condition, columnResolver({ name: campaign.name, status: campaign.status, createdAt: campaign.createdAt }));

  const [{ rows, total }, lists, { timezone }] = await Promise.all([
    listCampaigns({ filter, sort, size: page.size, offset: pageOffset(page.page, page.size) }),
    listContactListChoices(),
    getAppSettings(),
  ]);

  return (
    <CampaignsTable
      spec={SPEC}
      rows={rows as CampaignRow[]}
      sort={sort}
      total={total}
      page={page.page}
      size={page.size}
      lists={lists}
      timeZone={timezone}
    />
  );
}

export type { CampaignSortColumn };
