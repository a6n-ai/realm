import { Suspense } from "react";
import { eq, inArray } from "drizzle-orm";
import { zonedDateIso } from "@foundry/commons";
import { ClipboardListIcon, ListPlusIcon, PlusIcon, UploadIcon, InboxIcon, UsersIcon, TrendingUpIcon, XCircleIcon } from "lucide-react";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import Link from "next/link";
import { db } from "@/db/client";
import { deliveryZones, inquiries } from "@/db/schema";
import { requireStaff, roleCan } from "@/lib/auth/guards";
import { LOST_REASON_LABELS } from "@/lib/services/analytics/leads.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { listActiveLeadSources } from "@/lib/services/lead-sources.service";
import { inquiriesService, inquiryBucketWhere, type QueueTab } from "@/lib/services/inquiries.service";
import { canReassign } from "@/lib/services/reassign";
import { listAssignableStaff } from "@/lib/services/assignable-staff";
import { parseSort } from "@foundry/design-system/list-sort";
import { loadOwnerOptions, loadSourceOptions } from "@/lib/list/facet-options";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes } from "@/lib/catalog/types";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import {
  PageShell,
  PageHeader,
  SectionCard,
  parseFilterState,
  type FacetDef,
} from "@/components/ds";
import { AddInquirySheet } from "./new-inquiry-form";
import { QuickAddDialog } from "./quick-add/quick-add-dialog";
import { InquiriesList, InquiriesListSkeleton } from "./inquiries-list";
import { NextLeadCard, NextLeadSkeleton, leadScope } from "./next-lead-card";
import { NextRenewalCard, NextRenewalSkeleton } from "./next-renewal-card";
import { nextRenewal, queuedRenewal, renewalQueueCount, upNextRenewals } from "@/lib/services/next-renewal.service";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";

const UP_NEXT_COUNT = 6;
import { reassignInquiry } from "./actions";
import { SUB_STATUSES, SUB_STATUS_META } from "@/lib/inquiries/status";
import { QueueTabs } from "./queue-tabs";
import { RenewalsQueue, RenewalsQueueSkeleton } from "./renewals-queue";
import { MarkSectionRead } from "@/components/dashboard/mark-section-read";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { epochBoundsWhere, withDefaultMonth } from "@/lib/list/default-month";
import { inquiriesListHref, parseInquiryBucket } from "@/lib/list/inquiries-drill";
import { dayRange } from "@foundry/commons/util/dates";
import { requestNow } from "@/lib/dates/request-now";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ALL_OWNERS, ME, resolveOwnerParam } from "@/lib/list/presets";
import { eq as facetEq } from "@foundry/commons/model/condition";
type SearchParams = Promise<Record<string, string | undefined>>;

// "none" is New (sub_status is null); the resolver maps it to `is null`.
const SUB_STATUS_FACET_OPTIONS = [
  { value: "none", label: "New" },
  ...SUB_STATUSES.map((s) => ({ value: s, label: SUB_STATUS_META[s].label })),
];

const QUEUES: QueueTab[] = ["due", "overdue", "upcoming", "open", "closed", "quick"];
const EMPTY_COPY: Record<QueueTab, string> = {
  due: "Nobody to chase today.",
  overdue: "Nothing overdue.",
  upcoming: "No follow-ups scheduled.",
  open: "No open inquiries.",
  closed: "No closed inquiries.",
  quick: "No quick adds waiting. Paste numbers to add some.",
};

export default async function InquiriesPage({ searchParams }: { searchParams: SearchParams }) {
  // A bare landing shows the viewer's own inquiries; links that carry filters (cards, drill-downs) keep their meaning.
  if (Object.keys(await searchParams).length === 0) redirect(`/dashboard/inquiries?owner=${ME}`);
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

      <Suspense fallback={(await searchParams).view === "renewals" ? <NextRenewalSkeleton /> : <NextLeadSkeleton />}>
        <NextLead searchParams={searchParams} />
        <NextRenewal searchParams={searchParams} />
      </Suspense>

      <SectionCard title="Follow-up queue">
        <Suspense fallback={(await searchParams).view === "renewals" ? <RenewalsQueueSkeleton /> :<InquiriesListSkeleton />}>
          <QueueSection searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

/** The next lead on the Leads view, for the card's owner (default: the signed-in user). Ignores the list's other filters; Previous/Next walk that owner's leads. */
async function NextLead({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  const sp = await searchParams;
  const session = await getSession();
  const viewer = session?.user.id;
  const canRenewals = roleCan(session?.user.role ?? "", { order: ["read"] });
  if (!viewer || (canRenewals && sp.view === "renewals")) return null;

  const { timezone, currency } = await getAppSettings();
  const now = requestNow();
  const { start: dayStart, end: dayEnd } = dayRange(zonedDateIso(now, timezone), timezone);
  const leadOwner = typeof sp.leadOwner === "string" ? sp.leadOwner : ME;
  const scope = leadScope(leadOwner, viewer);
  const [owners, counts] = await Promise.all([loadOwnerOptions(), inquiriesService.queueCounts(scope, dayStart, dayEnd)]);
  const rowOf = (publicId: string) =>
    inquiriesService.listForPipeline(scope, { page: 0, size: 1 }, undefined, undefined, eq(inquiries.publicId, publicId)).then((r) => r.items[0] ?? null);

  const chosenId = typeof sp.lead === "string" ? sp.lead : undefined;
  const chosen = chosenId ? await rowOf(chosenId) : null;
  const lead = chosen ?? (await inquiriesService.nextLead(scope, dayStart, dayEnd).then((n) => (n ? rowOf(n.publicId) : null)));
  const [prev, next, upNextIds, leadInQueue] = lead
    ? await Promise.all([
        inquiriesService.nextLead(scope, dayStart, dayEnd, { publicId: lead.publicId, dir: "prev" }),
        inquiriesService.nextLead(scope, dayStart, dayEnd, { publicId: lead.publicId, dir: "next" }),
        inquiriesService.upNext(scope, dayStart, dayEnd, lead.publicId, UP_NEXT_COUNT),
        inquiriesService.inQueue(scope, dayStart, dayEnd, lead.publicId),
      ])
    : [null, null, [], false];
  const upNextRows = upNextIds.length
    ? await inquiriesService.listForPipeline(scope, { page: 0, size: upNextIds.length }, undefined, undefined, inArray(inquiries.publicId, upNextIds)).then((r) => r.items)
    : [];
  const upNext = upNextIds.flatMap((id) => upNextRows.filter((r) => r.publicId === id).map((r) => ({ ...r, href: `/dashboard/inquiries?${leadQuery(sp, r.publicId)}` })));
  const ownerOptions = [{ value: ME, label: "Me" }, { value: ALL_OWNERS, label: "All owners" }, ...owners];

  return (
    <NextLeadCard
      lead={lead}
      timeZone={timezone}
      currency={currency}
      now={now}
      dayStart={dayStart}
      dayEnd={dayEnd}
      dueCount={counts.due + counts.overdue}
      leadInQueue={leadInQueue}
      upcomingCount={counts.upcoming}
      owner={{ current: leadOwner, options: ownerOptions.map((o) => ({ ...o, href: leadOwnerHref(sp, o.value) })) }}
      prevHref={prev ? `/dashboard/inquiries?${leadQuery(sp, prev.publicId)}` : undefined}
      nextHref={next ? `/dashboard/inquiries?${leadQuery(sp, next.publicId)}` : undefined}
      upNext={upNext}
      upcomingHref={`/dashboard/inquiries?queue=upcoming&owner=${encodeURIComponent(leadOwner)}`}
      allOpenHref={`/dashboard/inquiries?queue=open&owner=${encodeURIComponent(leadOwner)}`}
    />
  );
}

/** The Renewals view's next plan to act on, for the card's owner (default: the signed-in user). Previous/Next walk that owner's queue. */
async function NextRenewal({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const session = await getSession();
  const viewer = session?.user.id;
  const canRenewals = roleCan(session?.user.role ?? "", { order: ["read"] });
  if (!viewer || !canRenewals || sp.view !== "renewals") return null;

  const [visible, { timezone }, owners] = await Promise.all([resolveSessionVisibleOrgIds(session), getAppSettings(), loadOwnerOptions()]);
  const today = zonedDateIso(requestNow(), timezone);
  const { start: dayStart, end: dayEnd } = dayRange(today, timezone);
  const day = { dayStart, dayEnd };
  const renewalOwner = typeof sp.renewalOwner === "string" ? sp.renewalOwner : ME;
  const scope = { visible, owner: resolveOwnerParam(renewalOwner, viewer) ?? null };
  const chosenId = typeof sp.renewal === "string" ? sp.renewal : undefined;
  const row = (chosenId ? await queuedRenewal(scope, today, day, chosenId) : null) ?? (await nextRenewal(scope, today, day));
  const [queueCount, prev, next, upNext] = await Promise.all([
    renewalQueueCount(scope, today, day),
    row ? nextRenewal(scope, today, day, { publicId: row.orderPublicId, dir: "prev" }) : null,
    row ? nextRenewal(scope, today, day, { publicId: row.orderPublicId, dir: "next" }) : null,
    row ? upNextRenewals(scope, today, day, row.orderPublicId, UP_NEXT_COUNT) : [],
  ]);
  const ownerOptions = [{ value: ME, label: "Me" }, { value: ALL_OWNERS, label: "All owners" }, ...owners];

  return (
    <NextRenewalCard
      row={row}
      today={today}
      queueCount={queueCount}
      owner={{ current: renewalOwner, options: ownerOptions.map((o) => ({ ...o, href: renewalOwnerHref(sp, o.value) })) }}
      prevHref={prev ? `/dashboard/inquiries?${renewalQuery(sp, prev.orderPublicId)}` : undefined}
      nextHref={next ? `/dashboard/inquiries?${renewalQuery(sp, next.orderPublicId)}` : undefined}
      upNext={upNext}
      renewQueueHref="/dashboard/inquiries?view=renewals&queue=renew"
    />
  );
}

/** Leads (the default) or Renewals, the plans that need a follow-up. The switch shows only to viewers who can read orders. */
async function QueueSection({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const canRenewals = roleCan((await getSession())?.user.role ?? "", { order: ["read"] });
  const renewals = canRenewals && sp.view === "renewals";
  return (
    <div className="flex flex-col gap-4">
      {canRenewals && <QueueViewSwitch view={renewals ? "renewals" : "leads"} owner={sp.owner} />}
      {renewals ? <RenewalsQueue sp={sp} /> : <InquiriesData searchParams={searchParams} />}
    </div>
  );
}
function QueueViewSwitch({ view, owner }: { view: "leads" | "renewals"; owner: string | undefined }) {
  const keep = owner ? `owner=${encodeURIComponent(owner)}` : "";
  const leadsHref = keep ? `/dashboard/inquiries?${keep}` : "/dashboard/inquiries";
  const renewalsHref = `/dashboard/inquiries?${["view=renewals", keep].filter(Boolean).join("&")}`;
  return (
    <Tabs value={view}>
      <TabsList variant="line" aria-label="Follow-up views">
        <TabsTrigger value="leads" asChild>
          <Link href={leadsHref} prefetch={false}>Leads</Link>
        </TabsTrigger>
        <TabsTrigger value="renewals" asChild>
          <Link href={renewalsHref} prefetch={false}>Renewals</Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
async function loadSheetData() {
  const [{ defaultCountry, timezone }, sources, zones, catalog] = await Promise.all([
    getAppSettings(),
    listActiveLeadSources(),
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
    <>
      <QuickAddDialog
        sources={sources}
        trigger={
          <Button variant="outline">
            <ListPlusIcon className="size-4" />
            Quick add
          </Button>
        }
      />
      <AddInquirySheet
        defaultCountry={defaultCountry}
        timeZone={timezone}
        sources={sources}
        zones={zones}
        catalog={catalog}
        trigger={newInquiryTrigger()}
      />
    </>
  );
}

async function InquiryStats({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  const sp = await withDefaultMonth(await searchParams);
  const where = epochBoundsWhere(inquiries.createdAt, sp);
  const owner = resolveOwnerParam(sp.owner, (await getSession())?.user.id);
  const g = await inquiriesService.groupCounts(where, owner ? facetEq("owner", owner) : undefined);
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

/** Keeps the viewer's tab, filters and sort, and shows `publicId` in the Next lead card. The list ignores `lead`. */
function leadQuery(sp: Awaited<SearchParams>, publicId: string): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && k !== "lead" && k !== "page") next.set(k, v);
  }
  next.set("lead", publicId);
  return next.toString();
}
/** Switching the card's owner keeps the list's tab and filters, and drops the chosen lead. */
function leadOwnerHref(sp: Awaited<SearchParams>, owner: string): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && k !== "lead" && k !== "page" && k !== "leadOwner") next.set(k, v);
  }
  next.set("leadOwner", owner);
  return `/dashboard/inquiries?${next.toString()}`;
}
/** Previous/Next on the renewal card: keeps the list's state (the list ignores `renewal`) and the card's owner. */
function renewalQuery(sp: Awaited<SearchParams>, publicId: string): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && k !== "renewal") next.set(k, v);
  }
  next.set("renewal", publicId);
  return next.toString();
}
/** Switching the renewal card's owner keeps the list's state, and drops the chosen plan. */
function renewalOwnerHref(sp: Awaited<SearchParams>, owner: string): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && k !== "renewal" && k !== "renewalOwner") next.set(k, v);
  }
  next.set("renewalOwner", owner);
  return `/dashboard/inquiries?${next.toString()}`;
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
    // Quick adds are worked through oldest first.
    { column: "created", dir: queue === "quick" ? "asc" : "desc" },
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
    { kind: "select", field: "owner", label: "Owner", options: [{ value: ME, label: "Me" }, { value: ALL_OWNERS, label: "All owners" }, ...owners] },
    { kind: "multi", field: "source", label: "Source", options: sources },
    { kind: "multi", field: "subsource", label: "Subsource", options: subsources, dependsOn: "source" },
    ...(zoneOptions.length ? [{ kind: "multi" as const, field: "zone", label: "Zone", options: zoneOptions }] : []),
    { kind: "multi", field: "lostReason", label: "Lost reason", options: Object.entries(LOST_REASON_LABELS).map(([value, label]) => ({ value, label })) },
    { kind: "dateRange", field: "createdAt", label: "Created" },
    { kind: "search", fields: ["fullName", "phone", "email"] },
  ];

  const viewer = (await getSession())?.user.id;
  const { condition, page } = parseFilterState(spec, { ...sp, owner: resolveOwnerParam(sp.owner, viewer) });
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
    <div className="flex flex-wrap items-center justify-between gap-2">
      <QueueTabs counts={counts} />
    </div>
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
