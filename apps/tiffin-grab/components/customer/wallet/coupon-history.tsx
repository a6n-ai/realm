"use client";

import { ListPagination } from "@/components/ds";
import { Reveal, LottieEmptyState } from "@/components/motion";
import { Skeleton, StatTile } from "@/components/customer/kit";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { CustomerCouponUse } from "@/lib/services/customer-finances.service";

function money(amount: string | number, currency: string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(Number(amount));
}

export type CouponTotals = { available: number; expiringSoon: number; uses: number; saved: string; lastUsedAt: number | null };

// Five tiles, two per row on a phone; the last one spans the row so the grid never ends ragged.
export function CouponStats({ totals, currency }: { totals: CouponTotals; currency: string }) {
  const tz = useTimezone();
  return (
    <section aria-label="Your coupons" className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <StatTile label="Available now" value={totals.available} />
      <StatTile label="Expiring this week" value={totals.expiringSoon} />
      <StatTile label="Times used" value={totals.uses} />
      <StatTile label="Saved with coupons" value={money(totals.saved, currency)} />
      <div className="col-span-2 md:col-span-1">
        <StatTile
          label="Last used"
          value={totals.lastUsedAt == null ? "Not yet" : formatEpoch(totals.lastUsedAt, { mode: "date", timeZone: tz })}
        />
      </div>
    </section>
  );
}

export function CouponStatsSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className={i === 4 ? "col-span-2 h-[92px] rounded-[20px] md:col-span-1" : "h-[92px] rounded-[20px]"} />
      ))}
    </div>
  );
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
        <LottieEmptyState animation="coin-burst" title="No coupons used yet" body="Apply a code at checkout and your savings show up here." />
      ) : (
        <Reveal.Group className="divide-y">
          {items.map((u) => (
            <UseRow key={u.publicId} use={u} currency={currency} />
          ))}
        </Reveal.Group>
      )}
      <ListPagination page={page} size={size} total={total} />
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
