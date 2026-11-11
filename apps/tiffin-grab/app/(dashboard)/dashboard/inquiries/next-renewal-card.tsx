import Link from "next/link";
import { Badge } from "@/components/reui/badge";
import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { Button } from "@foundry/ui/button";
import { humanDate } from "@/lib/deliveries-view";
import { isClosedTrack } from "@/lib/renewals/status";
import type { NextRenewalRow } from "@/lib/services/next-renewal.service";
import { ContactChips } from "@/components/dashboard/next-item/contact-chips";
import { initials } from "@foundry/ui/initials";
import { NextItemCard, NextItemEmpty, NextItemSkeleton, type NextItemView, type OwnerChoice } from "@/components/dashboard/next-item/next-item-card";
import { NextItemOpenButton } from "@/components/dashboard/next-item/open-button";
import { ReasonBadge } from "@/components/dashboard/next-item/reason-badge";
import { UpNextStrip, type UpNextTile } from "@/components/dashboard/next-item/up-next-strip";
import { EstimateButton } from "../renewals/estimate-button";
import { TrackStatusMenu } from "../renewals/_track/track-status";
import { RowTrackActions } from "./renewals-queue-list";

/** A queued plan after the current one; `href` opens it in the card (`renewal=`). */
export type UpNextRenewal = NextRenewalRow & { href: string };

export type NextRenewalCardProps = {
  row: NextRenewalRow | null;
  today: string;
  queueCount: number;
  owner: { current: string; options: OwnerChoice[] };
  prevHref?: string;
  nextHref?: string;
  upNext: UpNextRenewal[];
  renewQueueHref: string;
};

/** Where a plan's name and Open button lead: the customer's renewal page, or the order for a customer without an account. */
const openHref = (row: NextRenewalRow) => (row.customerPublicId ? `/dashboard/inquiries/renewals/${row.customerPublicId}` : `/dashboard/orders/${row.orderPublicId}`);

function reasonBadge(row: NextRenewalRow, today: string) {
  if (row.reason === "overdue") return <ReasonBadge variant="destructive-light">Follow-up overdue</ReasonBadge>;
  if (row.reason === "due") return <ReasonBadge variant="warning-light">Due today</ReasonBadge>;
  return row.lastTiffin && row.lastTiffin >= today ? (
    <ReasonBadge variant="secondary">Ends {humanDate(row.lastTiffin)}</ReasonBadge>
  ) : (
    <ReasonBadge variant="destructive-light">Lapsed {humanDate(row.lastTiffin)}</ReasonBadge>
  );
}

export function NextRenewalCard({ row, today, queueCount, owner, prevHref, nextHref, upNext, renewQueueHref }: NextRenewalCardProps) {
  const item: NextItemView | null = row
    ? {
        identity: (
          <div className="flex flex-wrap items-center gap-2">
            <Avatar><AvatarFallback>{initials(row.customerName)}</AvatarFallback></Avatar>
            <Link href={openHref(row)} className="min-w-0 truncate font-medium hover:underline">
              {row.customerName}
            </Link>
            {row.trial ? <Badge variant="secondary">Trial</Badge> : null}
            {row.customerPublicId ? <TrackStatusMenu orderPublicId={row.orderPublicId} customerPublicId={row.customerPublicId} status={row.track} source={row.trackSource} /> : null}
            {reasonBadge(row, today)}
            <div className="ml-auto flex items-center gap-1">
              {row.customerPublicId ? (
                <RowTrackActions orderPublicId={row.orderPublicId} customerPublicId={row.customerPublicId} closed={isClosedTrack(row.track)} />
              ) : null}
              <NextItemOpenButton href={openHref(row)} label={row.customerPublicId ? "Open customer" : "Open order"} />
            </div>
          </div>
        ),
        meta: <ContactChips name={row.customerName} phone={row.phone} />,
        facts: [
          ["Meal size", row.mealSize],
          ["Last tiffin", row.lastTiffin ? humanDate(row.lastTiffin) : null],
        ],
        note: row.lastActivity?.note ? (
          <blockquote className="text-muted-foreground border-l-2 pl-3 text-sm">
            <p className="line-clamp-2">{row.lastActivity.note}</p>
          </blockquote>
        ) : (
          <p className="text-muted-foreground text-xs">No notes yet</p>
        ),
        primary: <EstimateButton orderPublicId={row.orderPublicId} primary />,
        upNext:
          upNext.length > 0 ? (
            <UpNextStrip
              label="renewals"
              tiles={upNext.map(
                (r): UpNextTile => ({
                  key: r.orderPublicId,
                  href: r.href,
                  title: r.customerName,
                  badge: reasonBadge(r, today),
                  hint: r.mealSize,
                }),
              )}
              more={Math.max(0, queueCount - 1 - upNext.length)}
              viewAllHref={renewQueueHref}
            />
          ) : undefined,
      }
    : null;
  return (
    <NextItemCard
      title="Next renewal"
      noun="renewal"
      owner={owner}
      dueText={`${queueCount} to act on`}
      prevHref={prevHref}
      nextHref={nextHref}
      item={item}
      empty={
        <NextItemEmpty title="No renewals need attention.">
          <Button variant="outline" size="sm" asChild>
            <Link href={renewQueueHref} prefetch={false}>To renew</Link>
          </Button>
        </NextItemEmpty>
      }
    />
  );
}
