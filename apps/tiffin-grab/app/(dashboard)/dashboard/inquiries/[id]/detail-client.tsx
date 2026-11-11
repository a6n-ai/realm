"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  ArrowLeftIcon, ArrowRightIcon, CalendarClockIcon, MailIcon, MessageCircleIcon, MessageSquarePlusIcon, PhoneIcon, ShoppingBagIcon, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { EditContactDialog } from "./edit-contact-dialog";
import { cn } from "@foundry/ui/cn";
import { formatPhone, zonedDateIso } from "@foundry/commons";
import { Badge } from "@/components/reui/badge";
import { displayName } from "@/lib/inquiries/display";
import { formatMoney } from "@foundry/commons";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { formatEpoch } from "@/lib/format/datetime";
import { isClosed, type SubStatus } from "@/lib/inquiries/status";
import { logActivity } from "../actions";
import { unwrapAction } from "@/lib/actions/unwrap";
import type { ActionResult } from "@/lib/actions/action-result";
import { NoteDialog, StatusBoard, StatusPill, type NoteKind } from "../_leads/status-dialog";
import { FollowUpPicker } from "@/components/dashboard/pipeline/follow-up-picker";
import { BreadcrumbLabel } from "@/components/dashboard/app-breadcrumbs";
import { InquiryTimeline, type TimelineActivity } from "./inquiry-timeline";
import { ConvertSheet } from "./convert-sheet";
import { ReassignControl } from "@/components/reassign/reassign-control";
import type { OrderFormInput } from "./order-schema";
import { daysBetween } from "@foundry/commons/util/dates";

type Catalog = {
  plans: { key: string; name: string }[];
  mealSizes: { id: string; name: string; diet: string }[];
  frequencies: { key: string; name: string; weekdays?: string[] | null; savePct?: number }[];
  minTiffinsPerWeek?: number;
  maxTiffinsPerWeek?: number;
  durations: { weeks: number }[];
};

type Interest = {
  planInterest: string | null;
  mealSizeInterest: string | null;
  personsInterest: number | null;
  frequencyKeyInterest: string | null;
  eatingDaysInterest: string[] | null;
  preferredStart: string | null;
  postalCode: string | null;
  quotedPrice: string | null;
};

/** One block of the Details rail: divided, not boxed, so the rail reads as one panel. */
function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t py-4 first:border-t-0 first:pt-1 last:pb-0">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Card({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("bg-card flex flex-col gap-3 rounded-xl border p-4 sm:p-5", className)}>
      {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}

// Same icons and colours as the list's row quick actions.
function QuickAction({ icon: Icon, label, onClick, href, external }: {
  icon: LucideIcon; label: string; onClick?: () => void; href?: string; external?: boolean;
}) {
  const icon = <Icon className="text-muted-foreground" aria-hidden />;
  return href ? (
    <Button asChild variant="outline" size="sm">
      <a href={href} onClick={onClick} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{icon}{label}</a>
    </Button>
  ) : (
    <Button variant="outline" size="sm" onClick={onClick}>{icon}{label}</Button>
  );
}

function relativeDay(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Overdue → destructive badge, today → success badge, later → plain date plus a relative label. */
function FollowUpValue({ next, dayStart, dayEnd, tz }: { next: number; dayStart: number; dayEnd: number; tz: string }) {
  const date = formatEpoch(next, { mode: "date", timeZone: tz });
  const rel = relativeDay(daysBetween(zonedDateIso(dayStart, tz), zonedDateIso(next, tz)));
  if (next < dayStart) return <Badge variant="destructive-light">Overdue · {date}</Badge>;
  if (next < dayEnd) return <Badge variant="success-light">Today · {date}</Badge>;
  return <span className="tabular-nums">{date} <span className="text-muted-foreground">({rel})</span></span>;
}

export function InquiryDetailClient({
  inquiryId,
  subStatus,
  nextFollowUpAt,
  dayStart,
  dayEnd,
  createdAt,
  currency,
  convertedOrderHref,
  canEditContact,
  contact,
  sourceLabel,
  owner,
  reassign,
  notes,
  interest,
  activities,
  catalog,
  enabledSlots,
  prefill,
  unmatched,
  existing,
  prevLeadHref,
  nextLeadHref,
}: {
  inquiryId: string;
  subStatus: SubStatus | null;
  nextFollowUpAt: number | null;
  dayStart: number;
  dayEnd: number;
  createdAt: number;
  currency: string;
  convertedOrderHref?: string;
  contact: { fullName: string | null; phone: string | null; whatsappPhone: string | null; email: string | null; leadNumber: number | null };
  /** False once converted: the customer record owns the identity from then on. */
  canEditContact: boolean;
  sourceLabel: string;
  owner: { publicId: string | null; name: string | null };
  reassign: { staff: { publicId: string; name: string }[]; action: (inquiryId: string, ownerId: string) => Promise<ActionResult> } | null;
  notes: string | null;
  interest: Interest;
  activities: TimelineActivity[];
  catalog: Catalog;
  enabledSlots: { key: string; label: string }[];
  prefill: Partial<OrderFormInput>;
  unmatched: string[];
  existing: { publicId: string; fullName: string } | null;
  /** Neighbours in the recommended-lead cycle (inquiriesService.nextLead); absent when nothing else is due. */
  prevLeadHref?: string;
  nextLeadHref?: string;
}) {
  const tz = useTimezone();
  const router = useRouter();
  const terminal = isClosed(subStatus);
  const took = subStatus === "took_plan" || subStatus === "took_trial";
  const sp = useSearchParams();
  const [convertOpen, setConvertOpen] = useState(() => sp.get("convert") === "1" && !terminal);
  const [noteKind, setNoteKind] = useState<NoteKind | null>(null);
  const [pickPending, startPick] = useTransition();


  function saveFollowUp(at: number) {
    startPick(async () => {
      try {
        await unwrapAction(logActivity(inquiryId, { type: "callback", nextFollowUpAt: at }));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save follow-up");
      }
    });
  }

  const planLabel =
    catalog.plans.find((p) => p.key === interest.planInterest)?.name ??
    catalog.plans.find((p) => p.name.toLowerCase() === interest.planInterest?.trim().toLowerCase())?.name ??
    interest.planInterest;
  const mealLabel =
    catalog.mealSizes.find((m) => m.id === interest.mealSizeInterest)?.name ??
    catalog.mealSizes.find((m) => m.name.toLowerCase() === interest.mealSizeInterest?.trim().toLowerCase())?.name ??
    interest.mealSizeInterest;

  const interestChips: { label: string; value: string }[] = [];
  if (planLabel) interestChips.push({ label: "Plan", value: planLabel });
  if (mealLabel) interestChips.push({ label: "Meal size", value: mealLabel });
  if (interest.personsInterest != null) interestChips.push({ label: "Persons", value: String(interest.personsInterest) });
  const freqName = catalog.frequencies.find((f) => f.key === interest.frequencyKeyInterest)?.name ?? interest.frequencyKeyInterest;
  if (freqName) interestChips.push({ label: "Delivery frequency", value: freqName });
  if (interest.eatingDaysInterest?.length) {
    interestChips.push({
      label: "Eating days",
      value: interest.eatingDaysInterest.map((d) => d[0].toUpperCase() + d.slice(1)).join(", "),
    });
  }
  if (interest.preferredStart) interestChips.push({ label: "Start", value: interest.preferredStart });
  if (interest.postalCode) interestChips.push({ label: "Postal", value: interest.postalCode });
  if (interest.quotedPrice) {
    interestChips.push({
      label: "Quoted",
      value: formatMoney(Number(interest.quotedPrice), currency),
    });
  }

  const whatsapp = contact.whatsappPhone ?? contact.phone;
  const followUp = nextFollowUpAt != null && !terminal ? <FollowUpValue next={nextFollowUpAt} dayStart={dayStart} dayEnd={dayEnd} tz={tz} /> : <span className="text-muted-foreground">None</span>;

  return (
    <div className="flex flex-col gap-4">
      <BreadcrumbLabel segment={inquiryId} label={displayName(contact)} />
      <section className="bg-card flex flex-col gap-4 rounded-xl border p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold break-words">{displayName(contact)}</h1>
              {canEditContact && <EditContactDialog inquiryId={inquiryId} contact={contact} />}
              {prevLeadHref && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={prevLeadHref}>
                    <ArrowLeftIcon />
                    Previous lead
                  </Link>
                </Button>
              )}
              {nextLeadHref && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={nextLeadHref}>
                    Next lead
                    <ArrowRightIcon />
                  </Link>
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {contact.phone ? <QuickAction icon={PhoneIcon} label={formatPhone(contact.phone)} href={`tel:${contact.phone}`} /> : null}
            {whatsapp ? (
              <QuickAction icon={MessageCircleIcon} label={`WhatsApp ${formatPhone(whatsapp)}`} href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} external />
            ) : null}
            {contact.email ? <QuickAction icon={MailIcon} label={contact.email} href={`mailto:${contact.email}`} /> : null}
            <span className="text-muted-foreground text-sm">{sourceLabel}</span>
            <span className="text-muted-foreground text-sm">Added {formatEpoch(createdAt, { mode: "date", timeZone: tz })}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <StatusPill subStatus={subStatus} />
            <span className="inline-flex items-center gap-2">
              <span className="text-muted-foreground">Owner</span>
              {reassign ? (
                <ReassignControl
                  currentOwnerId={owner.publicId}
                  currentOwnerName={owner.name}
                  staff={reassign.staff}
                  action={async (ownerId) => { await unwrapAction(reassign.action(inquiryId, ownerId)); }}
                />
              ) : (
                <span className="font-medium">{owner.name ?? "Unassigned"}</span>
              )}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="text-muted-foreground">Next follow-up</span>
              {followUp}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <QuickAction icon={MessageSquarePlusIcon} label="Add note" onClick={() => setNoteKind("note")} />
          {terminal ? null : (
            <>
              <QuickAction icon={CalendarClockIcon} label="Set follow-up" onClick={() => setNoteKind("follow_up")} />
              <Button size="sm" onClick={() => setConvertOpen(true)}>
                <ShoppingBagIcon aria-hidden />
                Convert to order
              </Button>
            </>
          )}
          {took && convertedOrderHref ? (
            <Button asChild variant="outline" size="sm"><Link href={convertedOrderHref}>View order</Link></Button>
          ) : null}
        </div>
      </section>

      {took ? null : (
        <section className="bg-card flex flex-col gap-3 rounded-xl border p-4 sm:p-5">
          <h2 className="text-base font-semibold">Status</h2>
          <StatusBoard inquiryId={inquiryId} subStatus={subStatus} />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <Card title="Activity" className="min-w-0">
          <InquiryTimeline activities={activities} currency={currency} onAddNote={() => setNoteKind("note")} />
        </Card>

        <aside className="min-w-0 lg:sticky lg:top-4">
          <Card title="Details" className="gap-0">
            <DetailSection title="Follow-up">
              <p className="text-sm">{followUp}</p>
              {terminal ? null : (
                <fieldset disabled={pickPending} className="min-w-0">
                  <FollowUpPicker timeZone={tz} value={null} onChange={(v) => { if (v) saveFollowUp(v.at); }} />
                </fieldset>
              )}
            </DetailSection>
            <DetailSection title="Interest">
              {interestChips.length ? (
                <dl className="flex flex-col gap-1.5">
                  {interestChips.map((c) => (
                    <div key={c.label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 text-sm">
                      <dt className="text-muted-foreground">{c.label}</dt>
                      <dd className="font-medium tabular-nums break-words">{c.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-muted-foreground text-sm">No interest recorded yet. Add it as a note after the call.</p>
              )}
            </DetailSection>
            {notes ? (
              <DetailSection title="Initial notes">
                <p className="text-sm break-words whitespace-pre-wrap">{notes}</p>
              </DetailSection>
            ) : null}
          </Card>
        </aside>
      </div>

      {noteKind ? (
        <NoteDialog key={noteKind} open onOpenChange={(o) => { if (!o) setNoteKind(null); }} inquiryId={inquiryId} timeZone={tz} kind={noteKind} />
      ) : null}

      <ConvertSheet
        open={convertOpen}
        onOpenChange={setConvertOpen}
        hideTrigger
        inquiryId={inquiryId}
        contact={contact}
        catalog={catalog}
        enabledSlots={enabledSlots}
        prefill={prefill}
        unmatched={unmatched}
        currency={currency}
        existing={existing}
      />
    </div>
  );
}
