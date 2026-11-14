import { savePct } from "@/lib/pricing/discounts";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { NotFoundError, zonedDateIso } from "@foundry/commons";
import { describeActivityActor } from "@/lib/order-activity/order-activity-describe";
import { db } from "@/db/client";
import { leadSources, orders, users } from "@/db/schema";
import { canReassign } from "@/lib/services/reassign";
import { listAssignableStaff } from "@/lib/services/assignable-staff";
import { reassignInquiry } from "../actions";
import { requireStaff } from "@/lib/auth/guards";
import { assertInquiriesVisible, inquiriesService } from "@/lib/services/inquiries.service";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { findExistingByContact } from "@/lib/services/customers.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes, mealSizeAddons } from "@/lib/catalog/types";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { Skeleton } from "@foundry/ui/skeleton";
import { PageShell } from "@/components/ds";
import type { SubStatus } from "@/lib/inquiries/status";
import { interestToPrefill } from "../../_leads/interest-prefill";
import { InquiryDetailClient } from "./detail-client";
import type { TimelineActivity } from "./inquiry-timeline";
import { dayRange } from "@foundry/commons/util/dates";
import { requestNow } from "@/lib/dates/request-now";
import { getSession } from "@/lib/auth/session";
import { eq as facetEq } from "@foundry/commons/model/condition";

export default function InquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageShell>
      <Suspense fallback={<InquiryDetail.Skeleton />}>
        <InquiryDetail params={params} />
      </Suspense>
    </PageShell>
  );
}

async function InquiryDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  let inq;
  try {
    await assertInquiriesVisible([id], await resolveSessionVisibleOrgIds(await getSession()));
    inq = await inquiriesService.read(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const [catalog, slots, existing, [source], activities, { currency, timezone }, [owner], mayReassign] = await Promise.all([
    loadCatalogSnapshot(),
    dishCategoriesService.enabledCategories(),
    inq.phone || inq.email ? findExistingByContact(inq.phone, inq.email) : null,
    db.select({ label: leadSources.label }).from(leadSources).where(eq(leadSources.id, inq.sourceId)).limit(1),
    inquiriesService.listActivities(id),
    getAppSettings(),
    inq.currentOwner
      ? db.select({ publicId: users.publicId, name: users.name }).from(users).where(eq(users.id, inq.currentOwner)).limit(1)
      : Promise.resolve([] as { publicId: string; name: string | null }[]),
    canReassign(),
  ]);
  // Same default scope as the list's landing view: the viewer's own leads.
  const viewer = (await getSession())?.user.id;

  const enabledSlots = slots.map((s) => ({ key: s.key, label: s.label }));
  const convertCatalog = {
    plans: catalog.plans.map((p) => ({ key: p.key, name: p.name })),
    mealSizes: listableMealSizes(catalog.mealSizes).map((m) => ({ id: m.publicId, name: m.name, diet: m.planKey, trial: m.trial, servesWeekends: m.servesWeekends, allowedDays: m.allowedDays ?? null, addons: m.trial ? [] : mealSizeAddons(catalog) })),
    frequencies: catalog.frequencies.map((f) => ({ key: f.key, name: f.name, weekdays: f.weekdays, savePct: savePct(catalog.discounts, "delivery", f.publicId, 0, catalog.maxDiscountPct) })),
    minTiffinsPerWeek: catalog.minTiffinsPerWeek,
    timezone: catalog.timezone,
    cutoffHour: catalog.cutoffHour,
    maxTiffinsPerWeek: catalog.maxTiffinsPerWeek,
    durations: catalog.durations.map((d) => ({ weeks: d.weeks })),
  };

  // Lossless mapping of the lead's stated interest → order-form prefill, with the
  // free-text it couldn't match surfaced separately for the convert context header.
  const { prefill, unmatched } = interestToPrefill(
    {
      planInterest: inq.planInterest,
      mealSizeInterest: inq.mealSizeInterest,
      personsInterest: inq.personsInterest,
      frequencyKeyInterest: inq.frequencyKeyInterest,
      eatingDaysInterest: inq.eatingDaysInterest,
      preferredStart: inq.preferredStart,
      postalCode: inq.postalCode,
      quotedPrice: inq.quotedPrice,
    },
    { plans: convertCatalog.plans, mealSizes: convertCatalog.mealSizes, frequencies: convertCatalog.frequencies },
  );

  let convertedOrderHref: string | undefined;
  // currentOrderId is the round's order; convertedOrderId is only set on rows converted before it existed.
  const linkedOrderId = inq.currentOrderId ?? inq.convertedOrderId;
  if (linkedOrderId != null) {
    const [ord] = await db
      .select({ publicId: orders.publicId })
      .from(orders)
      .where(eq(orders.id, linkedOrderId))
      .limit(1);
    if (ord) convertedOrderHref = `/dashboard/orders/${ord.publicId}`;
  }

  const now = requestNow();
  const todayIso = zonedDateIso(now, timezone);
  const { start: dayStart, end: dayEnd } = dayRange(todayIso, timezone);
  // Recommended-lead cycle around this one (see nextLead), in the viewer's own leads.
  const leadScope = viewer ? facetEq("owner", viewer) : undefined;
  const [prevLead, nextLead] = await Promise.all([
    inquiriesService.nextLead(leadScope, dayStart, dayEnd, { publicId: inq.publicId, dir: "prev" }),
    inquiriesService.nextLead(leadScope, dayStart, dayEnd, { publicId: inq.publicId, dir: "next" }),
  ]);

  // Status changes from the old stage model (no sub-status recorded) are noise now; notes, calls and the rest stay.
  const timeline: TimelineActivity[] = activities
    .filter((a) => a.type !== "stage_change" || a.fromSubStatus != null || a.toSubStatus != null)
    .map((a) => ({
    publicId: a.publicId,
    type: a.type,
    note: a.note,
    outcome: a.outcome,
    amount: a.amount,
    nextFollowUpAt: a.nextFollowUpAt,
    fromStage: a.fromStage,
    toStage: a.toStage,
    fromSubStatus: a.fromSubStatus,
    toSubStatus: a.toSubStatus,
    createdAt: a.createdAt,
    actor: describeActivityActor(a),
  }));

  return (
    <InquiryDetailClient
        inquiryId={inq.publicId}
        subStatus={inq.subStatus as SubStatus | null}
        nextFollowUpAt={inq.nextFollowUpAt}
        dayStart={dayStart}
        dayEnd={dayEnd}
        createdAt={inq.createdAt}
        now={now}
        currency={currency}
        convertedOrderHref={convertedOrderHref}
        contact={{
          fullName: inq.fullName,
          phone: inq.phone,
          whatsappPhone: inq.whatsappPhone,
          email: inq.email,
          leadNumber: inq.leadNumber,
          metaLeadId: inq.metaLeadId,
        }}
        canEditContact={inq.stage !== "converted"}
        sourceLabel={source?.label ?? ""}
        owner={{ publicId: owner?.publicId ?? null, name: owner?.name ?? null }}
        reassign={mayReassign ? { staff: await listAssignableStaff(), action: reassignInquiry } : null}
        notes={inq.notes}
        interest={{
          planInterest: inq.planInterest,
          mealSizeInterest: inq.mealSizeInterest,
          personsInterest: inq.personsInterest,
          frequencyKeyInterest: inq.frequencyKeyInterest,
          eatingDaysInterest: inq.eatingDaysInterest,
          preferredStart: inq.preferredStart,
          postalCode: inq.postalCode,
          quotedPrice: inq.quotedPrice,
        }}
        activities={timeline}
        catalog={convertCatalog}
        enabledSlots={enabledSlots}
        prefill={prefill}
        unmatched={unmatched}
        existing={existing}
        prevLeadHref={prevLead ? `/dashboard/inquiries/${prevLead.publicId}` : undefined}
        nextLeadHref={nextLead ? `/dashboard/inquiries/${nextLead.publicId}` : undefined}
      />
  );
}

InquiryDetail.Skeleton = function InquiryDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <Skeleton className="h-96 w-full rounded-xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
};
