import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  ClipboardListIcon,
  PhoneIcon,
  MessageCircleIcon,
  MailIcon,
  StickyNoteIcon,
  ArrowRightIcon,
  CheckCircleIcon,
} from "lucide-react";
import { eq } from "drizzle-orm";
import { NotFoundError } from "@tiffin/commons";
import { db } from "@/db/client";
import { leadSources } from "@/db/schema";
import { formatEpoch } from "@/lib/format/datetime";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService, type InquiryStage } from "@/lib/services/inquiries.service";
import { findExistingByContact } from "@/lib/services/customers.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { mealSlotsService } from "@/lib/services/meal-slots.service";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageHeader, SectionCard, ListRow, SkeletonListRows } from "@/components/ds";
import { ActivityComposer, MarkLostDialog, StageControl } from "./inquiry-controls";
import { ConvertSheet } from "./convert-sheet";
import type { OrderFormInput } from "./order-schema";

const ICON: Record<string, typeof PhoneIcon> = {
  call: PhoneIcon,
  whatsapp: MessageCircleIcon,
  email: MailIcon,
  note: StickyNoteIcon,
  stage_change: ArrowRightIcon,
  created: ArrowRightIcon,
  converted: CheckCircleIcon,
};

function describe(a: { type: string; note: string | null; outcome: string | null; fromStage: string | null; toStage: string | null }) {
  switch (a.type) {
    case "created": return "Inquiry created";
    case "converted": return "Converted to an order";
    case "stage_change": return `Stage: ${a.fromStage} → ${a.toStage}`;
    case "call": case "whatsapp": case "email":
      return `${a.type[0].toUpperCase()}${a.type.slice(1)}${a.outcome ? ` — ${a.outcome}` : ""}`;
    default: return a.note ?? "";
  }
}

export default function InquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageShell>
      <PageHeader icon={ClipboardListIcon} title="Inquiry" />

      <SectionCard title="Details">
        <Suspense fallback={<InquiryDetails.Skeleton />}>
          <InquiryDetails params={params} />
        </Suspense>
      </SectionCard>

      <SectionCard title="Activity">
        <Suspense fallback={<InquiryActivity.Skeleton />}>
          <InquiryActivity params={params} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function InquiryDetails({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  let inq;
  try {
    inq = await inquiriesService.read(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const converted = inq.stage === "converted";
  const lost = inq.stage === "lost";

  const [catalog, slots, existing, [source]] = await Promise.all([
    loadCatalogSnapshot(),
    mealSlotsService.enabledSlots(),
    findExistingByContact(inq.phone, inq.email),
    db.select({ label: leadSources.label }).from(leadSources).where(eq(leadSources.id, inq.sourceId)).limit(1),
  ]);
  const enabledSlots = slots.map((s) => ({ key: s.key, label: s.label }));
  const convertCatalog = {
    plans: catalog.plans.map((p) => ({ key: p.key, name: p.name })),
    mealSizes: catalog.mealSizes.map((m) => ({ id: m.publicId, name: m.name, diet: m.diet })),
    frequencies: catalog.frequencies.map((f) => ({ key: f.key, name: f.name })),
    durations: catalog.durations.map((d) => ({ weeks: d.weeks })),
  };
  const prefill: Partial<OrderFormInput> = {
    ...(inq.planInterest ? { planKey: inq.planInterest } : {}),
    ...(inq.mealSizeInterest ? { mealSizeId: inq.mealSizeInterest } : {}),
    ...(inq.personsInterest != null ? { persons: inq.personsInterest } : {}),
    ...(inq.preferredStart ? { startDate: inq.preferredStart } : {}),
    ...(inq.postalCode ? { postalCode: inq.postalCode } : {}),
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <StageControl inquiryId={inq.publicId} stage={inq.stage as InquiryStage} />
        {converted ? (
          <span className="text-muted-foreground text-sm">Converted</span>
        ) : (
          <>
            <ConvertSheet
              inquiryId={inq.publicId}
              contact={{ fullName: inq.fullName, phone: inq.phone, email: inq.email ?? "" }}
              catalog={convertCatalog}
              enabledSlots={enabledSlots}
              prefill={prefill}
              existing={existing}
            />
            {lost ? null : <MarkLostDialog inquiryId={inq.publicId} />}
          </>
        )}
        <Badge variant="secondary" className="ml-auto capitalize">{source?.label}</Badge>
      </div>
      <p className="text-muted-foreground text-sm">{inq.phone}{inq.email ? ` · ${inq.email}` : ""}</p>
      {inq.notes ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Initial notes: </span>{inq.notes}
        </p>
      ) : null}
    </div>
  );
}

InquiryDetails.Skeleton = function InquiryDetailsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="ml-auto h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-4 w-80" />
    </div>
  );
};

async function InquiryActivity({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  let inq;
  try {
    inq = await inquiriesService.read(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const activities = await inquiriesService.listActivities(id);
  const converted = inq.stage === "converted";
  const lost = inq.stage === "lost";
  const now = Date.now();

  return (
    <div className="space-y-3">
      <ActivityComposer inquiryId={inq.publicId} />
      <div className="space-y-2">
        {activities.map((a, i) => {
          const Icon = ICON[a.type] ?? StickyNoteIcon;
          const overdue =
            a.nextFollowUpAt != null && a.nextFollowUpAt < now && i === 0 && !converted && !lost;
          return (
            <ListRow
              key={a.publicId}
              avatar={<Icon className="size-4" />}
              title={describe(a)}
              meta={
                <>
                  <div>{formatEpoch(a.createdAt, { mode: "datetime" })}</div>
                  {a.nextFollowUpAt != null ? (
                    <div>↳ Next: {formatEpoch(a.nextFollowUpAt, { mode: "date" })}</div>
                  ) : null}
                </>
              }
              trailing={overdue ? <Badge variant="destructive">Overdue</Badge> : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

InquiryActivity.Skeleton = function InquiryActivitySkeleton() {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-40" />
        </div>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-9 w-24" />
      </div>
      <SkeletonListRows rows={6} />
    </div>
  );
};
