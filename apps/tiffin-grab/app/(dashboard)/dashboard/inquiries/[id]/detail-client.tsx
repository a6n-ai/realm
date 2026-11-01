"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";
import { formatPhone } from "@foundry/commons";
import { displayName } from "@/lib/inquiries/display";
import { formatMoney } from "@/lib/format/money";
import { useTimezone } from "@/components/providers/timezone-provider";
import { formatEpoch } from "@/lib/format/datetime";
import { isClosed, statusLabel, type SubStatus } from "@/lib/inquiries/status";
import type { ActivityType } from "@/lib/services/inquiries.service";
import type { NextActionKind } from "../_leads/next-action";
import { StatusPill, StatusPopup } from "../_leads/status-popup";
import { InquiryJourney } from "./inquiry-journey";
import { ActivityComposer } from "./activity-composer";
import { InquiryTimeline, type TimelineActivity } from "./inquiry-timeline";
import { ConvertSheet } from "./convert-sheet";
import { ReassignControl } from "@/components/reassign/reassign-control";
import type { OrderFormInput } from "./order-schema";

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

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-card rounded-xl border p-4 sm:p-5", className)}>{children}</div>;
}

export function InquiryDetailClient({
  inquiryId,
  subStatus,
  nextFollowUpAt,
  currency,
  convertedOrderHref,
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
}: {
  inquiryId: string;
  subStatus: SubStatus | null;
  nextFollowUpAt: number | null;
  currency: string;
  convertedOrderHref?: string;
  contact: { fullName: string | null; phone: string | null; email: string | null };
  sourceLabel: string;
  owner: { publicId: string | null; name: string | null };
  reassign: { staff: { publicId: string; name: string }[]; action: (inquiryId: string, ownerId: string) => Promise<void> } | null;
  notes: string | null;
  interest: Interest;
  activities: TimelineActivity[];
  catalog: Catalog;
  enabledSlots: { key: string; label: string }[];
  prefill: Partial<OrderFormInput>;
  unmatched: string[];
  existing: { publicId: string; fullName: string } | null;
}) {
  const tz = useTimezone();
  const terminal = isClosed(subStatus);
  const took = subStatus === "took_plan" || subStatus === "took_trial";
  const sp = useSearchParams();
  const [convertOpen, setConvertOpen] = useState(() => sp.get("convert") === "1" && !terminal);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Remounting the composer with a fresh key lets a repeated nudge re-open the
  // same chip even when the composer was already open on a different chip.
  const [composerKey, setComposerKey] = useState(0);
  const [composerDefault, setComposerDefault] = useState<ActivityType | undefined>(undefined);

  // Journey owns the status popup and view_order (when a href exists); the parent
  // only needs to route activity → pre-open a composer chip, convert → open sheet.
  function onNudge(action: NextActionKind) {
    if (action?.kind === "activity") {
      setComposerDefault(action.activity);
      setComposerKey((k) => k + 1);
    } else if (action?.kind === "convert") {
      setConvertOpen(true);
    }
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
      value: formatMoney(Math.round(Number(interest.quotedPrice) * 100), currency),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPopup
          inquiryId={inquiryId}
          subStatus={subStatus}
          timeZone={tz}
          onConvert={() => setConvertOpen(true)}
          trigger={<button type="button" aria-label="Change status" className="cursor-pointer"><StatusPill subStatus={subStatus} /></button>}
        />
        {nextFollowUpAt != null && !terminal ? (
          <span className="text-muted-foreground text-sm">
            Next follow-up <span className="text-foreground tabular-nums">{formatEpoch(nextFollowUpAt, { mode: "date", timeZone: tz })}</span>
          </span>
        ) : null}
      </div>
      <InquiryJourney
        inquiryId={inquiryId}
        subStatus={subStatus}
        convertedOrderHref={convertedOrderHref}
        onNudge={onNudge}
        onConvert={() => setConvertOpen(true)}
        droppedLabel={statusLabel(subStatus)}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
        <Card className="min-w-0 lg:col-start-1 lg:row-start-1">
          <h2 className="mb-3 text-base font-semibold">Log activity</h2>
          <ActivityComposer
            key={composerKey}
            inquiryId={inquiryId}
            currency={currency}
            defaultOpen={composerDefault}
          />
        </Card>

        <aside className="min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">From the inquiry</h2>
              <button
                type="button"
                onClick={() => setDetailsOpen((o) => !o)}
                aria-expanded={detailsOpen}
                aria-label="Toggle inquiry details"
                className="text-muted-foreground hover:text-foreground -mr-1 rounded-md p-1 transition-colors lg:hidden"
              >
                <ChevronDownIcon className={cn("size-4 transition-transform", detailsOpen && "rotate-180")} />
              </button>
            </div>

            <div className={cn("mt-3 space-y-4", detailsOpen ? "block" : "hidden", "lg:block")}>
              <div className="space-y-2">
                <InfoRow label="Name" value={displayName(contact)} />
                <InfoRow label="Phone" value={contact.phone ? formatPhone(contact.phone) : "No phone"} />
                <InfoRow label="Email" value={contact.email || "No email"} />
                <InfoRow
                  label="Source"
                  value={<Badge variant="secondary" className="capitalize">{sourceLabel}</Badge>}
                />
                <InfoRow
                  label="Owner"
                  value={reassign ? (
                    <ReassignControl
                      currentOwnerId={owner.publicId}
                      currentOwnerName={owner.name}
                      staff={reassign.staff}
                      action={(ownerId) => reassign.action(inquiryId, ownerId)}
                    />
                  ) : (owner.name ?? "Unassigned")}
                />
              </div>

              {interestChips.length ? (
                <div className="space-y-1.5">
                  <p className="text-muted-foreground text-xs font-medium">Interest</p>
                  <div className="flex flex-wrap gap-1.5">
                    {interestChips.map((c) => (
                      <span
                        key={c.label}
                        className="bg-muted/40 text-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                      >
                        <span className="text-muted-foreground">{c.label}:</span>
                        <span className="tabular-nums">{c.value}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {notes ? (
                <p className="text-sm">
                  <span className="text-muted-foreground">Initial notes: </span>
                  {notes}
                </p>
              ) : null}

              {!terminal ? (
                <Button className="w-full" onClick={() => setConvertOpen(true)}>
                  Create order
                </Button>
              ) : took && convertedOrderHref ? (
                <Button asChild variant="outline" className="w-full">
                  <Link href={convertedOrderHref}>View order</Link>
                </Button>
              ) : null}
            </div>
          </Card>
        </aside>

        <Card className="min-w-0 lg:col-start-1 lg:row-start-2">
          <h2 className="mb-4 text-base font-semibold">Activity</h2>
          <InquiryTimeline activities={activities} currency={currency} terminal={terminal} />
        </Card>
      </div>

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
