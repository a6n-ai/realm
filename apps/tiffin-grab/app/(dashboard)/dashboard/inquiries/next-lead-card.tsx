import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon, PhoneIcon } from "lucide-react";
import { formatPhone } from "@foundry/commons";
import { SectionCard } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { formatEpoch } from "@/lib/format/datetime";
import { displayName } from "@/lib/inquiries/display";
import type { PipelineRow } from "@/lib/services/inquiries.service";
import { StatusPill } from "./_leads/status-dialog";

export type NextLeadCardProps = {
  lead: PipelineRow | null;
  timeZone: string;
  dayStart: number;
  prevHref?: string;
  nextHref?: string;
  allOpenHref: string;
};

export function NextLeadCard({ lead, timeZone, dayStart, prevHref, nextHref, allOpenHref }: NextLeadCardProps) {
  return (
    <SectionCard title="Next lead">
      {lead ? (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Link href={`/dashboard/inquiries/${lead.publicId}`} className="truncate font-medium hover:underline">
                {displayName(lead)}
              </Link>
              <StatusPill subStatus={lead.subStatus} />
            </div>
            <div className="text-muted-foreground text-sm">
              {lead.phone ? formatPhone(lead.phone) : "No phone"}
            </div>
            <div className="text-sm">
              Next follow-up{" "}
              {lead.nextFollowUpAt != null ? (
                <span className={lead.nextFollowUpAt < dayStart ? "text-destructive tabular-nums" : "tabular-nums"}>
                  {formatEpoch(lead.nextFollowUpAt, { mode: "datetime", timeZone })}
                </span>
              ) : (
                "not set"
              )}
            </div>
            {lead.lastNote ? <p className="text-muted-foreground truncate text-xs">{lead.lastNote}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {prevHref ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={prevHref} prefetch={false}>
                  <ArrowLeftIcon className="size-4" />
                  Previous
                </Link>
              </Button>
            ) : null}
            {nextHref ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={nextHref} prefetch={false}>
                  Next
                  <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/inquiries/${lead.publicId}`}>Open</Link>
            </Button>
            {lead.phone ? (
              <Button variant="outline" size="sm" asChild>
                <a href={`tel:${lead.phone}`}>
                  <PhoneIcon className="size-4" />
                  Call
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">No leads due. You&apos;re clear.</p>
          <Button variant="outline" size="sm" asChild>
            <Link href={allOpenHref} prefetch={false}>All open</Link>
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

export function NextLeadSkeleton() {
  return (
    <SectionCard title="Next lead">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    </SectionCard>
  );
}
