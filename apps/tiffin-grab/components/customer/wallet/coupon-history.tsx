"use client";

import Link from "next/link";
import { Tag, Ticket, TicketPercent } from "lucide-react";
import { EmptyState, IconTile, ListGroup, ListRow, Skeleton, StatGroup, StatTile, buttonClass } from "@/components/customer/kit";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { CustomerCouponUse } from "@/lib/services/customer-finances.service";
import { QuietPagination } from "./finance-kit";

function money(amount: string | number, currency: string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(Number(amount));
}

export function CouponStats({ available, saved, currency }: { available: number; saved: string; currency: string }) {
  return (
    <StatGroup>
      <StatTile bare icon={<IconTile tint="yellow"><Ticket /></IconTile>} label="Available" value={available} unit={available === 1 ? "coupon" : "coupons"} />
      <StatTile bare icon={<IconTile tint="cyan"><Tag /></IconTile>} label="Saved with coupons" value={money(saved, currency)} />
    </StatGroup>
  );
}

export function CouponStatsSkeleton() {
  return <Skeleton className="h-[104px] rounded-[20px]" />;
}

function UseRow({ use, currency }: { use: CustomerCouponUse; currency: string }) {
  const tz = useTimezone();
  return (
    <ListRow
      tint="blue"
      icon={<TicketPercent />}
      label={use.code ?? use.name}
      sublabel={`${use.orderDeploymentId} · ${formatEpoch(use.createdAt, { mode: "date", timeZone: tz })}`}
      value={<span className="text-ok">−{money(use.saved, currency)}</span>}
    />
  );
}

export function CouponHistory({
  items, page, size, total, currency,
}: {
  items: CustomerCouponUse[];
  page: number;
  size: number;
  total: number;
  currency: string;
}) {
  return (
    <section aria-labelledby="coupon-history" className="flex flex-col gap-3">
      <h2 id="coupon-history" className="c-h2">Coupons you&apos;ve used</h2>
      {items.length === 0 ? (
        <EmptyState
          icon={<TicketPercent className="size-6" />}
          title="No coupons used yet"
          body="Apply a code at checkout and your savings show up here."
          action={<Link href="/me/renew" className={buttonClass({ variant: "outline" })}>Renew plan</Link>}
        />
      ) : (
        <ListGroup>
          {items.map((u) => (
            <UseRow key={u.publicId} use={u} currency={currency} />
          ))}
        </ListGroup>
      )}
      {total > 0 && <QuietPagination page={page} size={size} total={total} />}
    </section>
  );
}

export function CouponHistorySkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-44 rounded-full" />
      <Skeleton className="h-[168px] w-full rounded-3xl" />
    </div>
  );
}
