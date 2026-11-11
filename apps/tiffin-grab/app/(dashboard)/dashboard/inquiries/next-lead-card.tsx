import Link from "next/link";
import { ArrowUpRightIcon, CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { eq } from "@foundry/commons/model/condition";
import { SectionCard } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { displayName } from "@/lib/inquiries/display";
import { ALL_OWNERS, ME, resolveOwnerParam } from "@/lib/list/presets";
import type { PipelineRow } from "@/lib/services/inquiries.service";
import { ContactChips } from "./_leads/contact-chips";
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
/** A recommended lead after the current one; `href` opens it in the card (`lead=`) and keeps the list's params. */
export type UpNextRow = PipelineRow & { href: string };
export type NextLeadCardProps = {
  lead: PipelineRow | null;
  timeZone: string;
  currency: string;
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
function QueueNav({ dueCount, prevHref, nextHref }: { dueCount: number; prevHref?: string; nextHref?: string }) {
  return (
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
  );
}
export function NextLeadCard({ lead, timeZone, currency, now, dayStart, dayEnd, dueCount, upcomingCount, owner, prevHref, nextHref, upNext, upcomingHref, allOpenHref }: NextLeadCardProps) {
  const hint = scopeHint(owner.current, owner.options);
  const picker = (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">{hint}</span>
      <NextLeadOwnerPicker label={owner.options.find((o) => o.value === owner.current)?.label ?? "Me"} options={owner.options} />
    </div>
  );
  const facts: [string, string | null][] = lead
    ? [
        ["Plan", lead.planInterest],
        ["Meal size", lead.mealSizeInterest],
        ["Quoted", lead.quotedPrice == null ? null : formatMoney(Number(lead.quotedPrice), currency)],
        ["Source", lead.source],
        ["Attempts", String(lead.attempts)],
      ].filter((f): f is [string, string] => f[1] != null && f[1] !== "")
    : [];
  return (
    <SectionCard title="Next lead" action={picker}>
      {lead ? (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-medium">
                {displayName(lead).replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "#"}
              </div>
              <Link href={`/dashboard/inquiries/${lead.publicId}`} className="min-w-0 truncate font-medium hover:underline">
                {displayName(lead)}
              </Link>
              <StatusPill subStatus={lead.subStatus} />
              <FollowUpBadge lead={lead} dayStart={dayStart} dayEnd={dayEnd} now={now} timeZone={timeZone} />
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <NextLeadNoteButton inquiryId={lead.publicId} timeZone={timeZone} />
                <Button variant="secondary" size="sm" asChild>
                  <Link href={`/dashboard/inquiries/${lead.publicId}`}>
                    <ArrowUpRightIcon className="size-4" />
                    Open lead
                  </Link>
                </Button>
                <QueueNav dueCount={dueCount} prevHref={prevHref} nextHref={nextHref} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs">created {ago(lead.createdAt, now)}</p>
              <ContactChips name={displayName(lead)} phone={lead.phone} whatsappPhone={lead.whatsappPhone} email={lead.email} />
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-5">
              {facts.map(([label, value]) => (
                <div key={label} className="flex min-w-0 flex-col">
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="truncate text-sm font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            {lead.lastNote ? (
              <blockquote className="text-muted-foreground border-l-2 pl-3 text-sm">
                <p className="line-clamp-2">{lead.lastNote}</p>
                <footer className="text-xs">{[lead.lastNoteBy, lead.lastNoteAt == null ? null : ago(lead.lastNoteAt, now)].filter(Boolean).join(", ")}</footer>
              </blockquote>
            ) : (
              <p className="text-muted-foreground text-xs">No notes yet</p>
            )}
          </div>
          {upNext.length > 0 ? (
            <UpNextStrip
              rows={upNext}
              more={Math.max(0, dueCount - 1 - upNext.length)}
              viewAllHref={allOpenHref}
              dayStart={dayStart}
              dayEnd={dayEnd}
              now={now}
              timeZone={timeZone}
              showOwner={owner.current === ALL_OWNERS}
            />
          ) : null}
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
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-32" />
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-8 w-full" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col gap-1">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="mt-3 flex flex-col gap-2 border-t pt-3 md:flex-row md:gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full shrink-0 md:w-64" />
        ))}
      </div>
    </SectionCard>
  );
}
