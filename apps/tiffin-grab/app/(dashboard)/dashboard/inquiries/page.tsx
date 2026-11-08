import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { zonedDateIso } from "@foundry/commons";
import { ClipboardListIcon, PlusIcon, UploadIcon, InboxIcon, UsersIcon, TrendingUpIcon, XCircleIcon } from "lucide-react";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import Link from "next/link";
import { db } from "@/db/client";
import { deliveryZones, inquiries, leadSources, leadSubsources } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { LOST_REASON_LABELS } from "@/lib/services/analytics/leads.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { inquiriesService, inquiryBucketWhere, type QueueTab } from "@/lib/services/inquiries.service";
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
import { SUB_STATUSES, SUB_STATUS_META } from "@/lib/inquiries/status";
import { QueueTabs } from "./queue-tabs";
import { MarkSectionRead } from "@/components/dashboard/mark-section-read";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { epochBoundsWhere, withDefaultMonth } from "@/lib/list/default-month";
import { inquiriesListHref, parseInquiryBucket } from "@/lib/list/inquiries-drill";
import { dayRange } from "@/lib/dates";
import { requestNow } from "@/lib/dates/request-now";
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
        <Suspense fallback={<StatCardsSkeleton count={5} />}>
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
  const sp = await withDefaultMonth(await searchParams);
  const where = epochBoundsWhere(inquiries.createdAt, sp);
  const g = await inquiriesService.groupCounts(where);
  const total = g.lead + g.followUp + g.took + g.lost;
  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "—");
  const href = (bucket: "all" | "lead" | "follow_up" | "took" | "lost") => inquiriesListHref(sp, bucket);

  return (
    <StatCards
      items={[
        { icon: ClipboardListIcon, label: "Total", value: total, hint: "created in selected dates", href: href("all") },
        { icon: InboxIcon, label: "Lead", value: g.lead, hint: "new · no response", href: href("lead") },
        { icon: UsersIcon, label: "Follow-up", value: g.followUp, hint: "responded · future · expected", href: href("follow_up") },
        { icon: TrendingUpIcon, label: "Took plan/trial", value: g.took, hint: `${pct(g.took)} conversion`, href: href("took") },
        { icon: XCircleIcon, label: "Lost", value: g.lost, hint: `${pct(g.lost)} · lost or undeliverable`, href: href("lost") },
      ]}
    />
  );
}

async function InquiriesData({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();

  // No default-month filter here: a follow-up queue must show older leads. Explicit from/to still apply.
  const sp = await searchParams;
  const bucket = parseInquiryBucket(sp.bucket);
  const queue = QUEUES.find((q) => q === sp.queue) ?? "due";
  const sort = parseSort(
    sp,
    ["name", "owner", "stage", "source", "nextFollowUp", "created"],
    { column: "created", dir: "desc" },
  );

  const [owners, { sources, subsources }, sheet, canReassignRecords, { timezone }, zoneOptions] = await Promise.all([
    loadOwnerOptions(),
    loadSourceOptions(),
    loadSheetData(),
    canReassign(),
    getAppSettings(),
    db.selectDistinct({ value: deliveryZones.name, label: deliveryZones.name }).from(deliveryZones).where(eq(deliveryZones.active, true)).orderBy(deliveryZones.name),
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
    ...(zoneOptions.length ? [{ kind: "multi" as const, field: "zone", label: "Zone", options: zoneOptions }] : []),
    { kind: "multi", field: "lostReason", label: "Lost reason", options: Object.entries(LOST_REASON_LABELS).map(([value, label]) => ({ value, label })) },
    { kind: "dateRange", field: "createdAt", label: "Created" },
    { kind: "search", fields: ["fullName", "phone", "email"] },
  ];

  const { condition, page } = parseFilterState(spec, sp);
  const todayIso = zonedDateIso(requestNow(), timezone);
  const { start: dayStart, end: dayEnd } = dayRange(todayIso, timezone);
  const [result, counts] = await Promise.all([
    inquiriesService.listForPipeline(
      condition,
      page,
      sort,
      bucket ? undefined : { tab: queue, dayStart, dayEnd },
      bucket ? inquiryBucketWhere(bucket) : undefined,
    ),
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
