import Link from "next/link";
import { Badge } from "@/components/reui/badge";
import { Button } from "@foundry/ui/button";
import { humanDate } from "@/lib/deliveries/view";
import { isClosedTrack } from "@/lib/renewals/status";
import type { NextRenewalRow } from "@/lib/renewals/next-renewal.service";
import { NextItemEmpty } from "@/components/dashboard/next-item/next-item-parts";
import { ReasonBadge } from "@/components/dashboard/next-item/reason-badge";
import { RecommendationGrid, type RecommendationItem, type RecommendationOwner } from "@/components/dashboard/next-item/recommendation-grid";
import { TrackStatusMenu } from "../renewals/_track/track-status";
import { NextRenewalActions } from "./next-renewal-actions";

export type NextRenewalsGridProps = {
  rows: NextRenewalRow[];
  /** Plans that need action in the viewer's scope; the header links the full queue beside it. */
  toAct: number;
  owner: RecommendationOwner;
  today: string;
  viewAllHref: string;
  error?: string;
};

/** Where a plan's name leads: the customer's renewal page, or the order for a customer without an account. */
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

export function NextRenewalsGrid({ rows, toAct, owner, today, viewAllHref, error }: NextRenewalsGridProps) {
  const items: RecommendationItem[] = rows.map((row) => ({
    key: row.orderPublicId,
    name: row.customerName,
    href: openHref(row),
    reason: (
      <>
        {row.trial ? <Badge variant="secondary">Trial</Badge> : null}
        {reasonBadge(row, today)}
        {row.phone ? null : <span> · No phone</span>}
      </>
    ),
    status: row.customerPublicId ? <TrackStatusMenu orderPublicId={row.orderPublicId} customerPublicId={row.customerPublicId} status={row.track} source={row.trackSource} /> : null,
    actions: (
      <NextRenewalActions
        orderPublicId={row.orderPublicId}
        customerPublicId={row.customerPublicId}
        name={row.customerName}
        phone={row.phone}
        closed={isClosedTrack(row.track)}
      />
    ),
  }));
  return (
    <RecommendationGrid
      title="Next renewals"
      owner={owner}
      toAct={toAct}
      viewAllHref={viewAllHref}
      items={items}
      error={error}
      empty={
        <NextItemEmpty title="No renewals need attention.">
          <Button variant="outline" size="sm" render={<Link href={viewAllHref} prefetch={false} />}>To renew</Button>
        </NextItemEmpty>
      }
    />
  );
}
