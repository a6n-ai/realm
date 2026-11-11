import Link from "next/link";
import { CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon, MessageCircleIcon, PhoneIcon } from "lucide-react";
import { formatPhone } from "@foundry/commons";
import { eq } from "@foundry/commons/model/condition";
import { SectionCard } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { displayName } from "@/lib/inquiries/display";
import { ALL_OWNERS, ME, resolveOwnerParam } from "@/lib/list/presets";
import type { PipelineRow } from "@/lib/services/inquiries.service";
import { StatusPill } from "./_leads/status-dialog";
import { ago, FollowUpBadge } from "./follow-up-badge";
import { NextLeadNoteButton, NextLeadOwnerPicker } from "./next-lead-actions";
import { UpNextStrip } from "./up-next-strip";

/** The card's owner scope: the signed-in user by default, everyone for "all", or one staff member's publicId. */
export function leadScope(leadOwner: string | undefined, viewer: string | undefined) {
  const owner = resolveOwnerParam(leadOwner ?? ME, viewer);
  return owner ? eq("owner", owner) : undefined;
}

export type OwnerChoice = { value: string; label: string; href: string };

/** A recommended lead after the current one; `href` shows it in the card and keeps the list's params. */
export type UpNextRow = PipelineRow;

export type NextLeadCardProps = {
  lead: PipelineRow | null;
  timeZone: string;
  now: number;
  dayStart: number;
  dayEnd: number;
  dueCount: number;
  upcomingCount: number;
  owner: { current: string; options: OwnerChoice[] };
  prevHref?: string;
  nextHref?: string;
  upNext: UpNextRow[];
  upcomingHref: string;
  allOpenHref: string;
};

export function scopeHint(current: string, options: OwnerChoice[]): string {
  if (current === ME) return "Your queue";
  if (current === ALL_OWNERS) return "All owners";
  const name = options.find((o) => o.value === current)?.label;
  return name ? `${name}'s queue` : "Owner's queue";
}

export function NextLeadCard({ lead, timeZone, now, dayStart, dayEnd, dueCount, upcomingCount, owner, prevHref, nextHref, upNext, upcomingHref, allOpenHref }: NextLeadCardProps) {
  const hint = scopeHint(owner.current, owner.options);
  const picker = (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">{hint}</span>
      <NextLeadOwnerPicker label={owner.options.find((o) => o.value === owner.current)?.label ?? "Me"} options={owner.options} />
    </div>
  );
  return (
    <SectionCard title="Next lead" action={picker}>
      {lead ? (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-medium">
                {displayName(lead).replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "#"}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Link href={`/dashboard/inquiries/${lead.publicId}`} className="truncate font-medium hover:underline">
                    {displayName(lead)}
                  </Link>
                  <StatusPill subStatus={lead.subStatus} />
                </div>
                <p className="text-muted-foreground truncate text-xs">
                  {[lead.phone ? formatPhone(lead.phone) : "No phone", lead.source, `created ${ago(lead.createdAt, now)}`].join(" · ")}
                </p>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5 md:w-64">
              <div>
                <FollowUpBadge lead={lead} dayStart={dayStart} dayEnd={dayEnd} now={now} timeZone={timeZone} />
              </div>
              {lead.lastNote ? <p className="bg-muted/40 text-muted-foreground line-clamp-2 rounded-md px-3 py-2 text-xs">{lead.lastNote}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {lead.phone ? (
                <Button variant="default" size="sm" asChild>
                  <a href={`tel:${lead.phone}`}>
                    <PhoneIcon className="size-4" />
                    Call
                  </a>
                </Button>
              ) : null}
              {lead.phone ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`}>
                    <MessageCircleIcon className="size-4" />
                    WhatsApp
                  </a>
                </Button>
              ) : null}
              <NextLeadNoteButton inquiryId={lead.publicId} timeZone={timeZone} />
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/dashboard/inquiries/${lead.publicId}`}>Open</Link>
              </Button>
              <div className="flex items-center gap-1">
                {prevHref ? (
                  <Button variant="ghost" size="icon-sm" aria-label="Previous lead" asChild>
                    <Link href={prevHref} prefetch={false}>
                      <ChevronLeftIcon className="size-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon-sm" aria-label="Previous lead" disabled>
                    <ChevronLeftIcon className="size-4" />
                  </Button>
                )}
                <span className="text-muted-foreground px-1 text-xs tabular-nums">{dueCount} due</span>
                {nextHref ? (
                  <Button variant="ghost" size="icon-sm" aria-label="Next lead" asChild>
                    <Link href={nextHref} prefetch={false}>
                      <ChevronRightIcon className="size-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon-sm" aria-label="Next lead" disabled>
                    <ChevronRightIcon className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          {upNext.length > 0 ? <UpNextStrip rows={upNext} dayStart={dayStart} dayEnd={dayEnd} now={now} timeZone={timeZone} showOwner={owner.current === ALL_OWNERS} /> : null}
        </>
      ) : (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
              <CheckCircle2Icon className="text-muted-foreground size-5" />
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">No leads due — you&apos;re clear.</p>
              <p className="text-muted-foreground text-xs tabular-nums">{upcomingCount} upcoming</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={upcomingHref} prefetch={false}>Upcoming</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href={allOpenHref} prefetch={false}>All open</Link>
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export function NextLeadSkeleton() {
  return (
    <SectionCard title="Next lead" action={<Skeleton className="h-8 w-40" />}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <div className="flex flex-1 items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <div className="flex flex-col gap-2 md:w-64">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
      <div className="mt-3 flex gap-3 border-t pt-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-64 shrink-0 rounded-lg" />
        ))}
      </div>
    </SectionCard>
  );
}
