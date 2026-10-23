"use client";

import { ListPagination } from "@/components/ds";
import { Reveal, LottieEmptyState } from "@/components/motion";
import Link from "next/link";
import { Skeleton, buttonClass } from "@/components/customer/kit";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { CustomerCouponUse } from "@/lib/services/customer-finances.service";

function money(amount: string | number, currency: string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(Number(amount));
}

export function CouponStats({ available, saved, currency }: { available: number; saved: string; currency: string }) {
  return (
    <p aria-label="Your coupons" className="c-caption nums">
      {available} available · {money(saved, currency)} saved with coupons
    </p>
  );
}

export function CouponStatsSkeleton() {
  return <Skeleton className="h-4 w-60 rounded-full" />;
}

function UseRow({ use, currency }: { use: CustomerCouponUse; currency: string }) {
  const tz = useTimezone();
  return (
    <Reveal className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{use.code ?? use.name}</p>
        <p className="text-muted-foreground truncate text-xs tabular-nums">
          {use.orderDeploymentId}
          {" · "}
          {formatEpoch(use.createdAt, { mode: "date", timeZone: tz })}
        </p>
      </div>
      <span className="text-ok shrink-0 text-sm font-semibold tabular-nums">−{money(use.saved, currency)}</span>
    </Reveal>
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
    <section aria-labelledby="coupon-history" className="space-y-3">
      <h2 id="coupon-history" className="text-base font-semibold tracking-tight">Coupons you&apos;ve used</h2>
      {items.length === 0 ? (
        <LottieEmptyState
          animation="coin-burst"
          title="No coupons used yet"
          body="Apply a code at checkout and your savings show up here."
          action={<Link href="/me/renew" className={buttonClass({ variant: "outline" })}>Renew plan</Link>}
        />
      ) : (
        <Reveal.Group className="divide-y">
          {items.map((u) => (
            <UseRow key={u.publicId} use={u} currency={currency} />
          ))}
        </Reveal.Group>
      )}
      {total > 0 && <ListPagination page={page} size={size} total={total} />}
    </section>
  );
}

export function CouponHistorySkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-44 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </div>
  );
}
