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
import { PageShell, PageHeader, SectionCard, ListRow } from "@/components/ds";
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

export default async function InquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  const inqP = inquiriesService.read(id);
  const activitiesP = inquiriesService.listActivities(id);
  let inq;
  try {
    inq = await inqP;
  } catch (e) {
    void activitiesP.catch(() => {});
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const activities = await activitiesP;
  const converted = inq.stage === "converted";
  const lost = inq.stage === "lost";
  const now = Date.now();

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
    <PageShell>
      <PageHeader
        icon={ClipboardListIcon}
        title={inq.fullName}
      />

      <SectionCard title="Details">
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
      </SectionCard>

      <SectionCard title="Activity">
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
      </SectionCard>
    </PageShell>
  );
}
