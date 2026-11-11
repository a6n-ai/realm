import Link from "next/link";
import { ArrowUpRightIcon, CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon, MessageCircleIcon, PhoneIcon } from "lucide-react";
import { formatPhone } from "@foundry/commons";
import { SectionCard } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { humanDate } from "@/lib/deliveries-view";
import { isClosedTrack } from "@/lib/renewals/status";
import type { NextRenewalRow } from "@/lib/services/next-renewal.service";
import { TrackStatusMenu } from "../renewals/_track/track-status";
import { NextLeadOwnerPicker } from "./next-lead-actions";
import { scopeHint, type OwnerChoice } from "./next-lead-card";
import { RowTrackActions } from "./renewals-queue-list";

export type NextRenewalCardProps = {
  row: NextRenewalRow | null;
  today: string;
  queueCount: number;
  owner: { current: string; options: OwnerChoice[] };
  prevHref?: string;
  nextHref?: string;
  upNext: NextRenewalRow[];
  renewQueueHref: string;
};

const initials = (name: string) =>
  name.replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "#";

/** Where a plan's name and Open button lead: the customer's renewal page, or the order for a customer without an account. */
const openHref = (row: NextRenewalRow) => (row.customerPublicId ? `/dashboard/inquiries/renewals/${row.customerPublicId}` : `/dashboard/orders/${row.orderPublicId}`);

export function ReasonBadge({ row, today }: { row: NextRenewalRow; today: string }) {
  if (row.reason === "overdue") return <Badge variant="destructive-light">Follow-up overdue</Badge>;
  if (row.reason === "due") return <Badge variant="warning-light">Due today</Badge>;
  return row.lastTiffin && row.lastTiffin >= today ? (
    <Badge variant="secondary">Ends {humanDate(row.lastTiffin)}</Badge>
  ) : (
    <Badge variant="destructive-light">Lapsed {humanDate(row.lastTiffin)}</Badge>
  );
}

/** The status menu and note/follow-up actions; a customer without an account has neither, only Open. */
function PlanActions({ row }: { row: NextRenewalRow }) {
  if (!row.customerPublicId) return null;
  return (
    <>
      <TrackStatusMenu orderPublicId={row.orderPublicId} customerPublicId={row.customerPublicId} status={row.track} source={row.trackSource} />
      <RowTrackActions orderPublicId={row.orderPublicId} customerPublicId={row.customerPublicId} closed={isClosedTrack(row.track)} />
    </>
  );
}

function UpNextRenewals({ rows, today }: { rows: NextRenewalRow[]; today: string }) {
  return (
    <section aria-label="Up next renewals" className="mt-3 border-t pt-3">
      <div tabIndex={0} className="focus-visible:ring-ring flex snap-x gap-3 overflow-x-auto pb-2 focus-visible:outline-none focus-visible:ring-2">
        {rows.map((row) => (
          <div key={row.orderPublicId} className="flex w-64 shrink-0 snap-start flex-col gap-2 rounded-lg border p-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Link href={openHref(row)} className="truncate text-sm font-medium hover:underline">
                {row.customerName}
              </Link>
              <span className="text-muted-foreground truncate text-xs">{row.mealSize}</span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <ReasonBadge row={row} today={today} />
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-1">
              <div className="flex flex-wrap items-center gap-1">
                <PlanActions row={row} />
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href={openHref(row)} aria-label={`Open ${row.customerName}`}>
                  <ArrowUpRightIcon className="size-4" />
                  Open
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function NextRenewalCard({ row, today, queueCount, owner, prevHref, nextHref, upNext, renewQueueHref }: NextRenewalCardProps) {
  const picker = (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs">{scopeHint(owner.current, owner.options)}</span>
      <NextLeadOwnerPicker label={owner.options.find((o) => o.value === owner.current)?.label ?? "Me"} options={owner.options} />
    </div>
  );
  return (
    <SectionCard title="Next renewal" action={picker}>
      {row ? (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-medium">{initials(row.customerName)}</div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Link href={openHref(row)} className="truncate font-medium hover:underline">
                    {row.customerName}
                  </Link>
                  {row.trial ? <Badge variant="secondary">Trial</Badge> : null}
                </div>
                <p className="text-muted-foreground truncate text-xs">
                  {[row.phone ? formatPhone(row.phone) : "No phone", row.mealSize, `last tiffin ${humanDate(row.lastTiffin)}`].join(" · ")}
                </p>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5 md:w-64">
              <div>
                <ReasonBadge row={row} today={today} />
              </div>
              {row.lastActivity?.note ? <p className="bg-muted/40 text-muted-foreground line-clamp-2 rounded-md px-3 py-2 text-xs">{row.lastActivity.note}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {row.phone ? (
                <Button variant="default" size="sm" asChild>
                  <a href={`tel:${row.phone}`}>
                    <PhoneIcon className="size-4" />
                    Call
                  </a>
                </Button>
              ) : null}
              {row.phone ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={`https://wa.me/${row.phone.replace(/\D/g, "")}`}>
                    <MessageCircleIcon className="size-4" />
                    WhatsApp
                  </a>
                </Button>
              ) : null}
              <PlanActions row={row} />
              <Button variant="ghost" size="sm" asChild>
                <Link href={openHref(row)}>Open</Link>
              </Button>
              <div className="flex items-center gap-1">
                {prevHref ? (
                  <Button variant="ghost" size="icon-sm" aria-label="Previous renewal" asChild>
                    <Link href={prevHref} prefetch={false}>
                      <ChevronLeftIcon className="size-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon-sm" aria-label="Previous renewal" disabled>
                    <ChevronLeftIcon className="size-4" />
                  </Button>
                )}
                <span className="text-muted-foreground px-1 text-xs tabular-nums">{queueCount} to act on</span>
                {nextHref ? (
                  <Button variant="ghost" size="icon-sm" aria-label="Next renewal" asChild>
                    <Link href={nextHref} prefetch={false}>
                      <ChevronRightIcon className="size-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon-sm" aria-label="Next renewal" disabled>
                    <ChevronRightIcon className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          {upNext.length > 0 ? <UpNextRenewals rows={upNext} today={today} /> : null}
        </>
      ) : (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
              <CheckCircle2Icon className="text-muted-foreground size-5" />
            </div>
            <p className="text-sm font-medium">No renewals need attention.</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={renewQueueHref} prefetch={false}>To renew</Link>
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

export function NextRenewalSkeleton() {
  return (
    <SectionCard title="Next renewal" action={<Skeleton className="h-8 w-40" />}>
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
