"use client";

import { Skeleton } from "@realm/ui/skeleton";
import { ListPagination } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { Reveal, LottieEmptyState } from "@/components/motion";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { MoneyLedgerTx } from "@/lib/services/customer-finances.service";
import { MONEY_LEDGER_FACETS } from "./money-ledger-facets";

function formatDollars(amount: string, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(Number(amount));
}

function typeLabel(type: MoneyLedgerTx["type"]): string {
  switch (type) {
    case "payment":
      return "Payment";
    case "refund":
      return "Refund";
    case "discount":
      return "Discount";
    case "adjustment":
      return "Adjustment";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function MoneyTxRow({ tx, currency }: { tx: MoneyLedgerTx; currency: string }) {
  const tz = useTimezone();
  const credit = tx.direction === "credit";
  return (
    <Reveal className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{typeLabel(tx.type)}</p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {formatEpoch(tx.createdAt, { mode: "datetime", timeZone: tz })}
          {tx.memo ? ` · ${tx.memo}` : ""}
        </p>
      </div>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${credit ? "text-ok" : "text-bad"}`}>
        {credit ? "+" : "−"}
        {formatDollars(tx.amount, currency)}
      </span>
    </Reveal>
  );
}

export function TransactionsList({
  items,
  page,
  size,
  total,
  currency,
}: {
  items: MoneyLedgerTx[];
  page: number;
  size: number;
  total: number;
  currency: string;
}) {
  return (
    <div className="space-y-4">
      <ReuiFacetFilters spec={MONEY_LEDGER_FACETS} />
      {items.length === 0 ? (
        <LottieEmptyState
          animation="coin-burst"
          title="No transactions yet"
          body="Payments, refunds, and discounts will appear here."
        />
      ) : (
        <Reveal.Group className="divide-y">
          {items.map((tx) => (
            <MoneyTxRow key={tx.publicId} tx={tx} currency={currency} />
          ))}
        </Reveal.Group>
      )}
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function TransactionsListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </div>
  );
}
