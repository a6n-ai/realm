"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Copy, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, Skeleton, buttonClass } from "@/components/customer/kit";
import { ListPagination } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { Reveal } from "@/components/motion";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { MoneyLedgerTx } from "@/lib/services/customer-finances.service";
import { MONEY_LEDGER_FACETS } from "./money-ledger-facets";
import { paymentMethodLabel } from "./payment-labels";

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

function CopyValue({ label, value }: { label: string; value: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast(`Copied ${label.toLowerCase()}`);
    } catch {
      toast(`Couldn't copy. It is ${value}`);
    }
  };
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate font-mono text-xs select-all">{value}</span>
      <button type="button" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`} className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]">
        <Copy aria-hidden className="size-3.5" />
      </button>
    </span>
  );
}

function MoneyTxRow({ tx, currency }: { tx: MoneyLedgerTx; currency: string }) {
  const tz = useTimezone();
  const credit = tx.direction === "credit";
  const method = tx.payment ? paymentMethodLabel(tx.payment) : null;
  const details: { label: string; value: ReactNode }[] = [
    tx.orderDeploymentId ? { label: "Order", value: tx.orderDeploymentId } : null,
    method ? { label: "Paid with", value: method } : null,
    tx.payment?.providerRef ? { label: "Transaction ID", value: <CopyValue label="Transaction ID" value={tx.payment.providerRef} /> } : null,
    tx.payment?.reference ? { label: "Your reference", value: tx.payment.reference } : null,
    tx.memo ? { label: "Note", value: tx.memo } : null,
    { label: "Receipt no.", value: <CopyValue label="Receipt number" value={tx.publicId} /> },
  ].filter((d) => d != null);
  return (
    <Reveal>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {typeLabel(tx.type)}
              {method ? <span className="text-muted-foreground font-normal"> · {method}</span> : null}
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {formatEpoch(tx.createdAt, { mode: "datetime", timeZone: tz })}
              {tx.orderDeploymentId ? ` · ${tx.orderDeploymentId}` : ""}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1">
            <span className={`text-sm font-semibold tabular-nums ${credit ? "text-ok" : "text-bad"}`}>
              {credit ? "+" : "−"}
              {formatDollars(tx.amount, currency)}
            </span>
            <ChevronDown aria-hidden className="text-muted-foreground size-4 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
          </span>
        </summary>
        <dl className="mb-3 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 rounded-2xl bg-[var(--muted)]/60 px-3 py-2 text-sm">
          {details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-muted-foreground text-xs">{d.label}</dt>
              <dd className="flex min-h-9 min-w-0 items-center justify-end text-right">{d.value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Reveal>
  );
}

export function TransactionsList({
  items,
  page,
  size,
  total,
  currency,
  filtered = false,
}: {
  items: MoneyLedgerTx[];
  page: number;
  size: number;
  total: number;
  currency: string;
  filtered?: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Stays while a filter is on, so an empty filtered result can still be cleared. */}
      {(total > 0 || filtered) && <ReuiFacetFilters spec={MONEY_LEDGER_FACETS} />}
      {items.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="size-6" />}
          title="No transactions yet"
          body="Payments, refunds, and discounts will appear here."
          action={<Link href="/me/renew" className={buttonClass({ variant: "outline" })}>Renew plan</Link>}
        />
      ) : (
        <Reveal.Group className="divide-y">
          {items.map((tx) => (
            <MoneyTxRow key={tx.publicId} tx={tx} currency={currency} />
          ))}
        </Reveal.Group>
      )}
      {total > 0 && <ListPagination page={page} size={size} total={total} />}
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
