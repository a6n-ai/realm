import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { zonedDateIso } from "@foundry/commons";
import { ClipboardListIcon, PlusIcon, DownloadIcon, UploadIcon, InboxIcon, UsersIcon, TrendingUpIcon, XCircleIcon } from "lucide-react";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import Link from "next/link";
import { db } from "@/db/client";
import { deliveryZones, inquiries, leadSources, leadSubsources } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { inquiriesService, type QueueTab } from "@/lib/services/inquiries.service";
import { canReassign } from "@/lib/services/reassign";
import { listAssignableStaff } from "@/lib/services/assignable-staff";
import { parseSort } from "@/lib/list/sort";
import { loadOwnerOptions, loadSourceOptions } from "@/lib/list/facet-options";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes } from "@/lib/catalog/types";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import {
  PageShell,
  PageHeader,
  SectionCard,
  parseFilterState,
  type FacetDef,
} from "@/components/ds";
import { AddInquirySheet } from "./new-inquiry-form";
import { InquiriesList, InquiriesListSkeleton } from "./inquiries-list";
import { reassignInquiry } from "./actions";
import { zonedDayStart } from "@/lib/analytics/drill";
import { SUB_STATUSES, SUB_STATUS_META } from "@/lib/inquiries/status";
import { QueueTabs } from "./queue-tabs";
import { MarkSectionRead } from "@/components/dashboard/mark-section-read";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { epochBoundsWhere, withDefaultMonth } from "@/lib/list/default-month";

type SearchParams = Promise<Record<string, string | undefined>>;

// "none" is New (sub_status is null); the resolver maps it to `is null`.
const SUB_STATUS_FACET_OPTIONS = [
  { value: "none", label: "New" },
  ...SUB_STATUSES.map((s) => ({ value: s, label: SUB_STATUS_META[s].label })),
];

const QUEUES: QueueTab[] = ["due", "overdue", "upcoming", "open", "closed"];
const EMPTY_COPY: Record<QueueTab, string> = {
  due: "Nobody to chase today.",
  overdue: "Nothing overdue.",
  upcoming: "No follow-ups scheduled.",
  open: "No open inquiries.",
  closed: "No closed inquiries.",
};

export default function InquiriesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <MarkSectionRead section="inquiries" />
      <PageHeader
        icon={ClipboardListIcon}
        title="Inquiries"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/inquiries/import">
                <UploadIcon className="size-4" />
                Import
              </Link>
            </Button>
            <Suspense fallback={<Skeleton className="h-9 w-24" />}>
              <ExportAction searchParams={searchParams} />
            </Suspense>
            <Suspense fallback={<Skeleton className="h-9 w-32" />}>
              <NewInquiryAction />
            </Suspense>
          </div>
        }
      />

      {/* The date range filters the cards: one group, tighter than the page rhythm. */}
      <div className="flex flex-col gap-3">
        <div className="flex">
          <SectionDateRange />
        </div>
        <Suspense fallback={<StatCardsSkeleton count={4} />}>
          <InquiryStats searchParams={searchParams} />
        </Suspense>
      </div>

      <SectionCard title="Follow-up queue">
        <Suspense fallback={<InquiriesListSkeleton />}>
          <InquiriesData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function loadSheetData() {
  const [{ defaultCountry, timezone }, sourceRows, subRows, zones, catalog] = await Promise.all([
    getAppSettings(),
    db
      .select({ id: leadSources.id, key: leadSources.key, label: leadSources.label, active: leadSources.active })
      .from(leadSources),
    db
      .select({
        sourceId: leadSubsources.sourceId,
        key: leadSubsources.key,
        label: leadSubsources.label,
        active: leadSubsources.active,
      })
      .from(leadSubsources),
    db
      .select({
        name: deliveryZones.name,
        postalPrefixes: deliveryZones.postalPrefixes,
        slotWindow: deliveryZones.slotWindow,
        active: deliveryZones.active,
      })
      .from(deliveryZones)
      .where(eq(deliveryZones.active, true)),
    loadCatalogSnapshot(),
  ]);

  const sources = sourceRows
    .filter((s) => s.active)
    .map((s) => ({
      key: s.key,
      label: s.label,
      subs: subRows
        .filter((sub) => sub.active && sub.sourceId === s.id)
        .map((sub) => ({ key: sub.key, label: sub.label })),
    }));

  const interestCatalog = {
    plans: catalog.plans.map((p) => ({ key: p.key, name: p.name })),
    mealSizes: listableMealSizes(catalog.mealSizes).map((m) => ({ id: m.publicId, name: m.name, diet: m.planKey })),
    frequencies: catalog.frequencies.map((f) => ({ key: f.key, name: f.name, weekdays: f.weekdays })),
  };

  return { defaultCountry, timezone, sources, zones, catalog: interestCatalog };
}

function newInquiryTrigger() {
  return (
    <Button>
      <PlusIcon className="size-4" />
      New inquiry
    </Button>
  );
}

// Plain-link download rather than client-side xlsx generation: the pipeline list is
// paginated (only one page of rows ever reaches the client), so the export has to hit
// the server for the full matching set. Forward every filter param except page/size so
// "Export" downloads what's currently filtered, not just what's currently in view.
async function ExportAction({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();

  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value && key !== "page" && key !== "size") qs.set(key, value);
  }
  const href = qs.size > 0 ? `/api/inquiries/export?${qs.toString()}` : "/api/inquiries/export";

  return (
    <Button variant="outline" asChild>
      <a href={href}>
        <DownloadIcon className="size-4" />
        Export
      </a>
    </Button>
  );
}

async function NewInquiryAction() {
  await requireStaff();

  const { defaultCountry, timezone, sources, zones, catalog } = await loadSheetData();

  return (
    <AddInquirySheet
      defaultCountry={defaultCountry}
      timeZone={timezone}
      sources={sources}
      zones={zones}
      catalog={catalog}
      trigger={newInquiryTrigger()}
    />
  );
}

async function InquiryStats({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  const where = epochBoundsWhere(inquiries.createdAt, await withDefaultMonth(await searchParams));
  const g = await inquiriesService.groupCounts(where);

  return (
    <StatCards
      items={[
        { icon: InboxIcon, label: "Lead", value: g.lead, hint: "new · no response" },
        { icon: UsersIcon, label: "Follow-up", value: g.followUp, hint: "responded · future · expected" },
        { icon: TrendingUpIcon, label: "Took plan/trial", value: g.took, hint: "converted to an order" },
        { icon: XCircleIcon, label: "Lost", value: g.lost, hint: "lost · undeliverable" },
      ]}
    />
  );
}

async function InquiriesData({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();

  // No default-month filter here: a follow-up queue must show older leads. Explicit from/to still apply.
  const sp = await searchParams;
  const queue = QUEUES.find((q) => q === sp.queue) ?? "due";
  const sort = parseSort(
    sp,
    ["name", "owner", "stage", "source", "nextFollowUp", "created"],
    { column: "created", dir: "desc" },
  );

  const [owners, { sources, subsources }, sheet, canReassignRecords, { timezone }] = await Promise.all([
    loadOwnerOptions(),
    loadSourceOptions(),
    loadSheetData(),
    canReassign(),
    getAppSettings(),
  ]);

  // Facet spec is server-authored so parseFilterState (server) and FacetFilters
  // (client) read the same shape. Search is the "search" facet — rendered by the
  // nav-bar search, not FacetFilters — and its OR(fullName, phone) is folded into
  // the condition here.
  const spec: FacetDef[] = [
    { kind: "pills", field: "subStatus", label: "Status", options: SUB_STATUS_FACET_OPTIONS },
    { kind: "select", field: "owner", label: "Owner", options: owners },
    { kind: "multi", field: "source", label: "Source", options: sources },
    { kind: "multi", field: "subsource", label: "Subsource", options: subsources, dependsOn: "source" },
    { kind: "dateRange", field: "createdAt", label: "Created" },
    { kind: "search", fields: ["fullName", "phone", "email"] },
  ];

  const { condition, page } = parseFilterState(spec, sp);
  const todayIso = zonedDateIso(Date.now(), timezone);
  const dayStart = zonedDayStart(todayIso, timezone);
  const dayEnd = zonedDayStart(new Date(Date.parse(`${todayIso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10), timezone);
  const [result, counts] = await Promise.all([
    inquiriesService.listForPipeline(condition, page, sort, { tab: queue, dayStart, dayEnd }),
    inquiriesService.queueCounts(condition, dayStart, dayEnd),
  ]);
  const staff = canReassignRecords ? await listAssignableStaff() : [];

  return (
    <div className="flex flex-col gap-4">
    <QueueTabs counts={counts} />
    <InquiriesList
      emptyMessage={EMPTY_COPY[queue]}
      spec={spec}
      rows={result.items}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
      canReassign={canReassignRecords}
      staff={staff}
      reassignAction={reassignInquiry}
      dayStart={dayStart}
      emptyCta={
        <AddInquirySheet
          defaultCountry={sheet.defaultCountry}
          timeZone={sheet.timezone}
          sources={sheet.sources}
          zones={sheet.zones}
          catalog={sheet.catalog}
          trigger={newInquiryTrigger()}
        />
      }
    />
    </div>
  );
}
