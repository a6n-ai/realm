import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ClipboardListIcon } from "lucide-react";
import { eq } from "drizzle-orm";
import { NotFoundError } from "@realm/commons";
import { db } from "@/db/client";
import { deliveryZones, leadSources, orders } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService, type InquiryStage } from "@/lib/services/inquiries.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { findExistingByContact } from "@/lib/services/customers.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { mealSlotsService } from "@/lib/services/meal-slots.service";
import { Skeleton } from "@realm/ui/skeleton";
import { PageShell, PageHeader, StageBadge } from "@/components/ds";
import { interestToPrefill } from "../_leads/interest-prefill";
import { InquiryDetailClient } from "./detail-client";
import type { TimelineActivity } from "./inquiry-timeline";

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
    inq = await inquiriesService.read(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const [catalog, slots, existing, [source], zones, activities, { currency }] = await Promise.all([
    loadCatalogSnapshot(),
    mealSlotsService.enabledSlots(),
    findExistingByContact(inq.phone, inq.email),
    db.select({ label: leadSources.label }).from(leadSources).where(eq(leadSources.id, inq.sourceId)).limit(1),
    db
      .select({
        name: deliveryZones.name,
        postalPrefixes: deliveryZones.postalPrefixes,
        slotWindow: deliveryZones.slotWindow,
        active: deliveryZones.active,
      })
      .from(deliveryZones)
      .where(eq(deliveryZones.active, true)),
    inquiriesService.listActivities(id),
    getAppSettings(),
  ]);

  const enabledSlots = slots.map((s) => ({ key: s.key, label: s.label }));
  const convertCatalog = {
    plans: catalog.plans.map((p) => ({ key: p.key, name: p.name })),
    mealSizes: catalog.mealSizes.map((m) => ({ id: m.publicId, name: m.name, diet: m.diet })),
    frequencies: catalog.frequencies.map((f) => ({ key: f.key, name: f.name })),
    durations: catalog.durations.map((d) => ({ weeks: d.weeks })),
  };

  // Lossless mapping of the lead's stated interest → order-form prefill, with the
  // free-text it couldn't match surfaced separately for the convert context header.
  const { prefill, unmatched } = interestToPrefill(
    {
      planInterest: inq.planInterest,
      mealSizeInterest: inq.mealSizeInterest,
      personsInterest: inq.personsInterest,
      preferredStart: inq.preferredStart,
      postalCode: inq.postalCode,
      quotedPrice: inq.quotedPrice,
    },
    { plans: convertCatalog.plans, mealSizes: convertCatalog.mealSizes },
  );

  let convertedOrderHref: string | undefined;
  if (inq.convertedOrderId != null) {
    const [ord] = await db
      .select({ publicId: orders.publicId })
      .from(orders)
      .where(eq(orders.id, inq.convertedOrderId))
      .limit(1);
    if (ord) convertedOrderHref = `/dashboard/orders/${ord.publicId}`;
  }

  const timeline: TimelineActivity[] = activities.map((a) => ({
    publicId: a.publicId,
    type: a.type,
    note: a.note,
    outcome: a.outcome,
    amount: a.amount,
    nextFollowUpAt: a.nextFollowUpAt,
    fromStage: a.fromStage,
    toStage: a.toStage,
    createdAt: a.createdAt,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ClipboardListIcon}
        title={inq.fullName}
        subtitle={inq.phone}
        actions={<StageBadge stage={inq.stage} />}
      />
      <InquiryDetailClient
        inquiryId={inq.publicId}
        stage={inq.stage as InquiryStage}
        currency={currency}
        convertedOrderHref={convertedOrderHref}
        contact={{ fullName: inq.fullName, phone: inq.phone, email: inq.email ?? "" }}
        sourceLabel={source?.label ?? ""}
        notes={inq.notes}
        interest={{
          planInterest: inq.planInterest,
          mealSizeInterest: inq.mealSizeInterest,
          personsInterest: inq.personsInterest,
          preferredStart: inq.preferredStart,
          postalCode: inq.postalCode,
          quotedPrice: inq.quotedPrice,
        }}
        activities={timeline}
        catalog={convertCatalog}
        enabledSlots={enabledSlots}
        zones={zones}
        prefill={prefill}
        unmatched={unmatched}
        existing={existing}
      />
    </div>
  );
}

InquiryDetail.Skeleton = function InquiryDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="ml-auto h-6 w-20 rounded-full" />
      </div>

      <Skeleton className="h-24 w-full rounded-xl" />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    </div>
  );
};
