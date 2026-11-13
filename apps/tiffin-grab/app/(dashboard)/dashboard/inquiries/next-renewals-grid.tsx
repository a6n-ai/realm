import Link from "next/link";
import { Badge } from "@/components/reui/badge";
import { Button } from "@foundry/ui/button";
import { humanDate } from "@/lib/deliveries/view";
import { isClosedTrack } from "@/lib/renewals/status";
import type { NextRenewalRow } from "@/lib/renewals/next-renewal.service";
import { ContactChips } from "@/components/dashboard/next-item/contact-chips";
import { NextItemEmpty } from "@/components/dashboard/next-item/next-item-card";
import { ReasonBadge } from "@/components/dashboard/next-item/reason-badge";
import { RecommendationGrid, type RecommendationItem, type RecommendationOwner } from "@/components/dashboard/next-item/recommendation-grid";
import { EstimateButton } from "../renewals/estimate-button";
import { TrackStatusMenu } from "../renewals/_track/track-status";
import { RowTrackActions } from "./renewals-queue-list";

export type NextRenewalsGridProps = {
  rows: NextRenewalRow[];
  /** Plans that need action in the viewer's scope; the header links the full queue beside it. */
  toAct: number;
  owner: RecommendationOwner;
  today: string;
  viewAllHref: string;
  error?: string;
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

export function NextRenewalsGrid({ rows, toAct, owner, today, viewAllHref, error }: NextRenewalsGridProps) {
  const items: RecommendationItem[] = rows.map((row) => ({
    key: row.orderPublicId,
    name: row.customerName,
    href: openHref(row),
    reason: (
      <>
        {row.trial ? <Badge variant="secondary">Trial</Badge> : null}
        {reasonBadge(row, today)}
      </>
    ),
    status: row.customerPublicId ? <TrackStatusMenu orderPublicId={row.orderPublicId} customerPublicId={row.customerPublicId} status={row.track} source={row.trackSource} /> : null,
    contact: <ContactChips compact name={row.customerName} phone={row.phone} whatsappPhone={null} email={null} />,
    actions: (
      <>
        {row.customerPublicId ? <RowTrackActions orderPublicId={row.orderPublicId} customerPublicId={row.customerPublicId} closed={isClosedTrack(row.track)} /> : null}
        <EstimateButton orderPublicId={row.orderPublicId} />
      </>
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
          <Button variant="outline" size="sm" asChild>
            <Link href={viewAllHref} prefetch={false}>To renew</Link>
          </Button>
        </NextItemEmpty>
      }
    />
  );
}
