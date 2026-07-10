"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Badge } from "@realm/ui/badge";
import { Button } from "@realm/ui/button";
import { cn } from "@realm/ui/cn";
import type { ZoneLike } from "@/lib/catalog/postal";
import { formatMoney } from "@/lib/format/money";
import type { InquiryStage, ActivityType } from "@/lib/services/inquiries.service";
import type { NextActionKind } from "../_leads/next-action";
import { InquiryJourney } from "./inquiry-journey";
import { ActivityComposer } from "./activity-composer";
import { InquiryTimeline, type TimelineActivity } from "./inquiry-timeline";
import { ConvertSheet } from "./convert-sheet";
import type { OrderFormInput } from "./order-schema";

type Catalog = {
  plans: { key: string; name: string }[];
  mealSizes: { id: string; name: string; diet: string }[];
  frequencies: { key: string; name: string }[];
  durations: { weeks: number }[];
};

type Interest = {
  planInterest: string | null;
  mealSizeInterest: string | null;
  personsInterest: number | null;
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
  stage,
  currency,
  convertedOrderHref,
  contact,
  sourceLabel,
  notes,
  interest,
  activities,
  catalog,
  enabledSlots,
  zones,
  prefill,
  unmatched,
  existing,
}: {
  inquiryId: string;
  stage: InquiryStage;
  currency: string;
  convertedOrderHref?: string;
  contact: { fullName: string; phone: string; email: string };
  sourceLabel: string;
  notes: string | null;
  interest: Interest;
  activities: TimelineActivity[];
  catalog: Catalog;
  enabledSlots: { key: string; label: string }[];
  zones: ZoneLike[];
  prefill: Partial<OrderFormInput>;
  unmatched: string[];
  existing: { publicId: string; fullName: string } | null;
}) {
  const terminal = stage === "converted" || stage === "lost";
  const [convertOpen, setConvertOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Remounting the composer with a fresh key lets a repeated nudge re-open the
  // same chip even when the composer was already open on a different chip.
  const [composerKey, setComposerKey] = useState(0);
  const [composerDefault, setComposerDefault] = useState<ActivityType | undefined>(undefined);

  // Journey owns stage nudges and view_order (when a href exists); the parent
  // only needs to route activity → pre-open a composer chip, convert → open sheet.
  function onNudge(action: NextActionKind) {
    if (action?.kind === "activity") {
      setComposerDefault(action.activity);
      setComposerKey((k) => k + 1);
    } else if (action?.kind === "convert") {
      setConvertOpen(true);
    }
  }

  const interestChips: { label: string; value: string }[] = [];
  if (interest.planInterest) interestChips.push({ label: "Plan", value: interest.planInterest });
  if (interest.mealSizeInterest) interestChips.push({ label: "Meal size", value: interest.mealSizeInterest });
  if (interest.personsInterest != null) interestChips.push({ label: "Persons", value: String(interest.personsInterest) });
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
      <InquiryJourney
        inquiryId={inquiryId}
        stage={stage}
        convertedOrderHref={convertedOrderHref}
        onNudge={onNudge}
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
                <InfoRow label="Name" value={contact.fullName} />
                <InfoRow label="Phone" value={contact.phone} />
                {contact.email ? <InfoRow label="Email" value={contact.email} /> : null}
                <InfoRow
                  label="Source"
                  value={<Badge variant="secondary" className="capitalize">{sourceLabel}</Badge>}
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
              ) : stage === "converted" && convertedOrderHref ? (
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
        zones={zones}
        prefill={prefill}
        unmatched={unmatched}
        currency={currency}
        existing={existing}
      />
    </div>
  );
}
