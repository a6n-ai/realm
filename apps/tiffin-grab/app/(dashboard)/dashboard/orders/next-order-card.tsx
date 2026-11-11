import Link from "next/link";
import { formatMoney } from "@foundry/commons";
import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { Button } from "@foundry/ui/button";
import type { NextOrderReason, NextOrderRow } from "@/lib/services/next-order.service";
import { ContactChips } from "@/components/dashboard/next-item/contact-chips";
import { initials } from "@foundry/ui/initials";
import { NextItemCard, NextItemEmpty, type NextItemView, type OwnerChoice } from "@/components/dashboard/next-item/next-item-card";
import { ReasonBadge } from "@/components/dashboard/next-item/reason-badge";
import { UpNextStrip, type UpNextTile } from "@/components/dashboard/next-item/up-next-strip";
import { NextOrderIconActions, NextOrderPrimary } from "./next-order-actions";

const DAY_MS = 86_400_000;

/** An order after the current one; `href` opens it in the card (`order=`). */
export type UpNextOrder = NextOrderRow & { href: string };

export type NextOrderCardProps = {
  row: NextOrderRow | null;
  currency: string;
  now: number;
  queueCount: number;
  owner: { current: string; options: OwnerChoice[] };
  prevHref?: string;
  nextHref?: string;
  upNext: UpNextOrder[];
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

export function NextOrderCard({ row, currency, now, queueCount, owner, prevHref, nextHref, upNext, attentionHref }: NextOrderCardProps) {
  const item: NextItemView | null = row
    ? {
        identity: (
          <div className="flex flex-wrap items-center gap-2">
            <Avatar><AvatarFallback>{initials(row.customerName)}</AvatarFallback></Avatar>
            <Link href={`/dashboard/orders/${row.publicId}`} className="min-w-0 truncate font-medium hover:underline">
              {row.customerName}
            </Link>
            {reasonBadge(row.reason, row.signalAt, now, row.amount, currency)}
            <div className="ml-auto flex items-center gap-1">
              <NextOrderIconActions row={row} />
            </div>
          </div>
        ),
        meta: (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs">{[row.code, `${row.planName} · ${row.mealSizeName}`].join(" · ")}</p>
            <ContactChips name={row.customerName} phone={row.phone} />
          </div>
        ),
        facts: [
          ["Amount", row.amount == null ? null : formatMoney(row.amount, currency)],
          ["Plan", row.planName],
          ["Meal size", row.mealSizeName],
        ],
        primary: <NextOrderPrimary row={row} />,
        upNext:
          upNext.length > 0 ? (
            <UpNextStrip
              label="orders"
              tiles={upNext.map(
                (r): UpNextTile => ({
                  key: r.publicId,
                  href: r.href,
                  title: r.customerName,
                  badge: reasonBadge(r.reason, r.signalAt, now, r.amount, currency),
                  hint: r.code,
                }),
              )}
              more={Math.max(0, queueCount - 1 - upNext.length)}
              viewAllHref={attentionHref}
            />
          ) : undefined,
      }
    : null;
  return (
    <NextItemCard
      title="Next order"
      noun="order"
      owner={owner}
      dueText={`${queueCount} to act on`}
      prevHref={prevHref}
      nextHref={nextHref}
      item={item}
      empty={
        <NextItemEmpty title="No orders need attention.">
          <Button variant="outline" size="sm" asChild>
            <Link href={attentionHref} prefetch={false}>Waiting on payment</Link>
          </Button>
        </NextItemEmpty>
      }
    />
  );
}
