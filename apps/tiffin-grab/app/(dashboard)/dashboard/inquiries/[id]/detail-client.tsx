"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  ArrowLeftIcon, ArrowRightIcon, MessageCircleIcon, PencilIcon, PhoneIcon, ShoppingBagIcon, StickyNoteIcon, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { initials } from "@foundry/ui/initials";
import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";
import { EditContactDialog } from "./edit-contact-dialog";
import { formatMoney } from "@foundry/commons";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { displayName, planLabelFor } from "@/lib/inquiries/display";
import { formatEpoch } from "@/lib/format/datetime";
import { isClosed, type SubStatus } from "@/lib/inquiries/status";
import { clearFollowUp, logActivity } from "../actions";
import { unwrapAction } from "@/lib/actions/unwrap";
import type { ActionResult } from "@/lib/actions/action-result";
import { NoteDialog, StatusMenu, type NoteKind } from "../_leads/status-dialog";
import { InlineComposer } from "../_leads/composer";
import { ContactChips, whatsappHref } from "@/components/dashboard/next-item/contact-chips";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@foundry/ui/collapsible";
import { BreadcrumbLabel } from "@/components/dashboard/app-breadcrumbs";
import { InquiryTimeline, type TimelineActivity } from "./inquiry-timeline";
import { ConvertSheet } from "./convert-sheet";
import { NextStepCard } from "./next-step-card";
import { ReassignControl } from "@/components/reassign/reassign-control";
import type { OrderFormInput } from "../../_order/order-schema";

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

function QueueNav({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={href} aria-label={label}>
            <Icon aria-hidden />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function InquiryDetailClient({
  inquiryId,
  subStatus,
  nextFollowUpAt,
  dayStart,
  dayEnd,
  createdAt,
  now,
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
  /** Server request clock, for the timeline's Today/Yesterday labels. */
  now: number;
  currency: string;
  convertedOrderHref?: string;
  contact: {
    fullName: string | null;
    phone: string | null;
    whatsappPhone: string | null;
    email: string | null;
    leadNumber: number | null;
    metaLeadId?: string | null;
  };
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
  const [composerOpen, setComposerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);


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

  function markFollowUpDone() {
    startPick(async () => {
      try {
        await unwrapAction(clearFollowUp(inquiryId));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not mark follow-up done");
      }
    });
  }

  const planLabel = planLabelFor(catalog.plans, interest.planInterest);
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

  const name = displayName(contact);
  const addPhone = !contact.phone && canEditContact;
  const waHref = whatsappHref(contact);

  return (
    <div className="flex flex-col gap-4 pb-[calc(var(--tabbar-h,4rem)+6.5rem)] md:pb-24 lg:pb-0">
      <BreadcrumbLabel segment={inquiryId} label={name} />
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar>
              <AvatarFallback>{initials(name)}</AvatarFallback>
            </Avatar>
            <h1 className="min-w-0 text-xl font-semibold break-words">{name}</h1>
            {canEditContact ? (
              <EditContactDialog
                inquiryId={inquiryId}
                contact={contact}
                trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit contact"><PencilIcon aria-hidden /></Button>}
              />
            ) : null}
            <StatusMenu inquiryId={inquiryId} subStatus={subStatus} />
            {prevLeadHref || nextLeadHref ? (
              <div className="ml-auto flex items-center gap-1">
                {prevLeadHref ? <QueueNav href={prevLeadHref} label="Previous lead" icon={ArrowLeftIcon} /> : null}
                {nextLeadHref ? <QueueNav href={nextLeadHref} label="Next lead" icon={ArrowRightIcon} /> : null}
              </div>
            ) : null}
          </div>

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>{sourceLabel}</span>
            <span>Added {formatEpoch(createdAt, { mode: "date", timeZone: tz })}</span>
            <span className="inline-flex items-center gap-2">
              Owner
              {reassign ? (
                <ReassignControl
                  currentOwnerId={owner.publicId}
                  currentOwnerName={owner.name}
                  staff={reassign.staff}
                  action={(ownerId) => reassign.action(inquiryId, ownerId)}
                />
              ) : (
                <span className="text-foreground font-medium">{owner.name ?? "Unassigned"}</span>
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <ContactChips name={name} phone={contact.phone} whatsappPhone={contact.whatsappPhone} email={contact.email} />
              {addPhone ? (
                <EditContactDialog
                  inquiryId={inquiryId}
                  contact={contact}
                  trigger={<Button variant="outline" size="sm"><PhoneIcon aria-hidden />Add phone</Button>}
                />
              ) : null}
            </div>
            {terminal ? null : (
              <Button size="sm" onClick={() => setConvertOpen(true)}>
                <ShoppingBagIcon aria-hidden />
                Convert to order
              </Button>
            )}
            {took && convertedOrderHref ? (
              <Button asChild variant="outline" size="sm"><Link href={convertedOrderHref}>View order</Link></Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          {terminal ? null : (
            <NextStepCard
              nextFollowUpAt={nextFollowUpAt}
              dayStart={dayStart}
              dayEnd={dayEnd}
              tz={tz}
              pending={pickPending}
              onPick={saveFollowUp}
              onMarkDone={markFollowUpDone}
            />
          )}
          <InlineComposer inquiryId={inquiryId} timeZone={tz} open={composerOpen} onOpenChange={setComposerOpen} terminal={terminal} />
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <InquiryTimeline activities={activities} currency={currency} onAddNote={() => setNoteKind("note")} now={now} />
            </CardContent>
          </Card>
        </div>

        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} asChild>
        <aside className="min-w-0 lg:sticky lg:top-4">
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full lg:hidden">Details</Button>
          </CollapsibleTrigger>
          <CollapsibleContent forceMount className="mt-4 max-lg:data-[state=closed]:hidden lg:mt-0 lg:block">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col">
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
            </CardContent>
          </Card>
          </CollapsibleContent>
        </aside>
        </Collapsible>
      </div>

      <div className="bg-background fixed inset-x-0 bottom-[calc(var(--tabbar-h,4rem)+max(0.75rem,env(safe-area-inset-bottom)))] z-30 flex gap-2 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:bottom-0 lg:hidden">
        {contact.phone ? (
          <Button asChild variant="outline" className="flex-1">
            <a href={`tel:${contact.phone}`}><PhoneIcon aria-hidden />Call</a>
          </Button>
        ) : null}
        {waHref ? (
          <Button asChild variant="outline" className="flex-1">
            <a href={waHref} target="_blank" rel="noopener noreferrer"><MessageCircleIcon aria-hidden />WhatsApp</a>
          </Button>
        ) : null}
        <Button variant="outline" className="flex-1" onClick={() => setComposerOpen(true)}>
          <StickyNoteIcon aria-hidden />
          Note
        </Button>
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
