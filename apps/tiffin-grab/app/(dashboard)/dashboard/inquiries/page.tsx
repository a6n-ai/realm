import { Suspense } from "react";
import { count, eq } from "drizzle-orm";
import { ClipboardListIcon, PlusIcon, InboxIcon, UsersIcon, TrendingUpIcon } from "lucide-react";
import { db } from "@/db/client";
import { deliveryZones, inquiries, leadSources, leadSubsources } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { canReassign } from "@/lib/services/reassign";
import { listAssignableStaff } from "@/lib/services/assignable-staff";
import { parseSort } from "@/lib/list/sort";
import { loadOwnerOptions, loadSourceOptions } from "@/lib/list/facet-options";
import { Button } from "@realm/ui/button";
import { Skeleton } from "@realm/ui/skeleton";
import {
  PageShell,
  PageHeader,
  SectionCard,
  StatGrid,
  SkeletonStatCards,
  parseFilterState,
  type FacetDef,
} from "@/components/ds";
import { AddInquirySheet } from "./new-inquiry-form";
import { InquiriesList, InquiriesListSkeleton } from "./inquiries-list";
import { reassignInquiry } from "./actions";
import { MarkSectionRead } from "@/components/dashboard/mark-section-read";

type SearchParams = Promise<Record<string, string | undefined>>;

// Single source of truth for the Stage facet. Real DB stages only — the pipeline
// pseudo-buckets ("all"/"overdue") were client-only toggles and never valid
// `inquiries.stage` values, so they can't be server-filter facet options.
const STAGE_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "quoted", label: "Quoted" },
  { value: "follow_up", label: "Follow-up" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

export default function InquiriesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <MarkSectionRead section="inquiries" />
      <PageHeader
        icon={ClipboardListIcon}
        title="Inquiries"
        actions={
          <Suspense fallback={<Skeleton className="h-9 w-32" />}>
            <NewInquiryAction />
          </Suspense>
        }
      />

      <Suspense fallback={<SkeletonStatCards count={3} className="sm:grid-cols-3" />}>
        <InquiryStats />
      </Suspense>

      <SectionCard title="All inquiries">
        <Suspense fallback={<InquiriesListSkeleton />}>
          <InquiriesData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function loadSheetData() {
  const [{ defaultCountry }, sourceRows, subRows, zones] = await Promise.all([
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

  return { defaultCountry, sources, zones };
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

  const { defaultCountry, sources, zones } = await loadSheetData();

  return (
    <AddInquirySheet
      defaultCountry={defaultCountry}
      sources={sources}
      zones={zones}
      trigger={newInquiryTrigger()}
    />
  );
}

async function InquiryStats() {
  await requireStaff();

  const [stageCounts, [{ total }]] = await Promise.all([
    db.select({ stage: inquiries.stage, n: count() }).from(inquiries).groupBy(inquiries.stage),
    db.select({ total: count() }).from(inquiries),
  ]);

  const countOf = (...stages: string[]) =>
    stageCounts.filter((r) => stages.includes(r.stage)).reduce((sum, r) => sum + r.n, 0);

  const open = countOf("new", "contacted", "follow_up");
  const converted = countOf("converted");
  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

  return (
    <StatGrid
      cols={3}
      items={[
        { icon: InboxIcon, label: "Total", value: total, hint: "all inquiries" },
        { icon: UsersIcon, label: "Open", value: open, hint: "new · contacted · follow-up" },
        {
          icon: TrendingUpIcon,
          label: "Converted",
          value: converted,
          hint: `${conversionRate}% conversion`,
        },
      ]}
    />
  );
}

async function InquiriesData({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();

  const sp = await searchParams;
  const sort = parseSort(
    sp,
    ["name", "owner", "stage", "source", "lastTouch", "created"],
    { column: "created", dir: "desc" },
  );

  const [owners, { sources, subsources }, sheet, canReassignRecords] = await Promise.all([
    loadOwnerOptions(),
    loadSourceOptions(),
    loadSheetData(),
    canReassign(),
  ]);

  // Facet spec is server-authored so parseFilterState (server) and FacetFilters
  // (client) read the same shape. Search is the "search" facet — rendered by the
  // nav-bar search, not FacetFilters — and its OR(fullName, phone) is folded into
  // the condition here.
  const spec: FacetDef[] = [
    { kind: "pills", field: "stage", label: "Stage", options: STAGE_OPTIONS },
    { kind: "select", field: "owner", label: "Owner", options: owners },
    { kind: "multi", field: "source", label: "Source", options: sources },
    { kind: "multi", field: "subsource", label: "Subsource", options: subsources, dependsOn: "source" },
    { kind: "dateRange", field: "createdAt", label: "Created" },
    { kind: "search", fields: ["fullName", "phone"] },
  ];

  const { condition, page } = parseFilterState(spec, sp);
  const result = await inquiriesService.listForPipeline(condition, page, sort);
  const staff = canReassignRecords ? await listAssignableStaff() : [];

  return (
    <InquiriesList
      spec={spec}
      rows={result.items}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
      canReassign={canReassignRecords}
      staff={staff}
      reassignAction={reassignInquiry}
      emptyCta={
        <AddInquirySheet
          defaultCountry={sheet.defaultCountry}
          sources={sheet.sources}
          zones={sheet.zones}
          trigger={newInquiryTrigger()}
        />
      }
    />
  );
}
