"use client";

import { Badge } from "@realm/ui/badge";
import { Skeleton } from "@realm/ui/skeleton";
import { ListPagination, OrderStatusBadge } from "@/components/ds";
import { Reveal, LottieEmptyState } from "@/components/motion";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { CustomerBill } from "@/lib/services/customer-finances.service";

function formatDollars(amount: string, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(Number(amount));
}

function monthKey(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(ms);
}

function monthLabel(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "long" }).format(ms);
}

function paymentLabel(status: CustomerBill["payments"][number]["status"]): string {
  switch (status) {
    case "simulated_paid":
      return "Paid";
    case "pending":
      return "Pending";
    case "refunded":
      return "Refunded";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function BillRow({ bill, currency }: { bill: CustomerBill; currency: string }) {
  const tz = useTimezone();
  return (
    <Reveal className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-medium">{bill.planName}</p>
        <p className="text-muted-foreground truncate text-xs tabular-nums">
          {bill.deploymentId}
          {" · "}
          {formatEpoch(bill.createdAt, { mode: "date", timeZone: tz })}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <OrderStatusBadge status={bill.status} />
          {bill.payments.map((p) => (
            <Badge key={p.publicId} variant="secondary" className="text-[0.65rem]">
              {paymentLabel(p.status)}
            </Badge>
          ))}
        </div>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {formatDollars(bill.total, currency)}
      </span>
    </Reveal>
  );
}

export function BillsList({
  items,
  page,
  size,
  total,
  currency,
}: {
  items: CustomerBill[];
  page: number;
  size: number;
  total: number;
  currency: string;
}) {
  const tz = useTimezone();

  if (items.length === 0) {
    return (
      <LottieEmptyState
        animation="coin-burst"
        title="No bills yet"
        body="Subscription receipts will appear here after you place an order."
      />
    );
  }

  const groups: { key: string; label: string; bills: CustomerBill[] }[] = [];
  for (const bill of items) {
    const key = monthKey(bill.createdAt, tz);
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.bills.push(bill);
    } else {
      groups.push({ key, label: monthLabel(bill.createdAt, tz), bills: [bill] });
    }
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.key} className="space-y-1">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {g.label}
          </h2>
          <Reveal.Group className="divide-y">
            {g.bills.map((bill) => (
              <BillRow key={bill.publicId} bill={bill} currency={currency} />
            ))}
          </Reveal.Group>
        </section>
      ))}
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function BillsListSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  );
}
