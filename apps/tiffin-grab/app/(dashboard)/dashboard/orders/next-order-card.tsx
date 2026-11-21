import Link from "next/link";
import { formatMoney } from "@foundry/commons";
import { Button } from "@foundry/ui/button";
import { OrderStatusBadge } from "@/components/ds";
import type { NextOrderReason, NextOrderRow } from "@/lib/orders/next-order.service";
import { NextItemEmpty, type OwnerChoice } from "@/components/dashboard/next-item/next-item-parts";
import { ReasonBadge } from "@/components/dashboard/next-item/reason-badge";
import { RecommendationGrid, type RecommendationItem } from "@/components/dashboard/next-item/recommendation-grid";
import { NextOrderActions } from "./next-order-actions";

const DAY_MS = 86_400_000;

export type NextOrderCardProps = {
  row: NextOrderRow | null;
  /** The orders after `row`; the grid shows as many as fit its row. */
  upNext: NextOrderRow[];
  currency: string;
  now: number;
  queueCount: number;
  owner: { current: string; options: OwnerChoice[] };
  attentionHref: string;
};

/** Badge text: payment reasons say how long the payment has been open, in days. */
export function reasonBadge(reason: NextOrderReason, signalAt: number, now: number, amount: number | null, currency: string) {
  const days = Math.max(0, Math.floor((now - signalAt) / DAY_MS));
  const money = amount == null ? "" : ` · ${formatMoney(amount, currency)}`;
  switch (reason) {
    case "verify":
      return <ReasonBadge variant="warning-light">Payment to verify{money}</ReasonBadge>;
    case "overdue":
      return <ReasonBadge variant="destructive-light">Payment overdue · {days}d{money}</ReasonBadge>;
    case "missed":
      return <ReasonBadge variant="destructive-light">Missed deliveries</ReasonBadge>;
    case "flagged":
      return <ReasonBadge variant="secondary">Flagged</ReasonBadge>;
    case "pending":
      return <ReasonBadge variant="outline">Payment pending{money}</ReasonBadge>;
  }
}

export function NextOrderCard({ row, upNext, currency, now, queueCount, owner, attentionHref }: NextOrderCardProps) {
  const items: RecommendationItem[] = (row ? [row, ...upNext] : []).map((r) => ({
    key: r.publicId,
    name: r.customerName,
    href: `/dashboard/orders/${r.publicId}`,
    status: <OrderStatusBadge status={r.status} />,
    reason: (
      <>
        {reasonBadge(r.reason, r.signalAt, now, r.amount, currency)}
        <span> · {r.code}</span>
      </>
    ),
    actions: (
      <NextOrderActions
        row={{ publicId: r.publicId, reason: r.reason, paymentPublicId: r.paymentPublicId, status: r.status, phone: r.phone, name: r.customerName }}
      />
    ),
  }));
  return (
    <RecommendationGrid
      title="Next order"
      owner={owner}
      toAct={queueCount}
      viewAllHref={attentionHref}
      items={items}
      empty={
        <NextItemEmpty title="No orders need attention.">
          <Button variant="outline" size="sm" render={<Link href={attentionHref} prefetch={false} />}>Waiting on payment</Button>
        </NextItemEmpty>
      }
    />
  );
}
