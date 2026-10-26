"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Copy, CreditCard, Percent, ReceiptText, RotateCcw, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, IconTile, ListGroup, Skeleton, buttonClass, type IconTint } from "@/components/customer/kit";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { MoneyLedgerTx } from "@/lib/services/customer-finances.service";
import { MONEY_LEDGER_FACETS } from "./money-ledger-facets";
import { paymentMethodLabel } from "@/lib/billing/payment-labels";
import { FilterBar, GroupHeader, QuietPagination, groupByMonth } from "./finance-kit";

const TYPE_STYLE: Record<MoneyLedgerTx["type"], { tint: IconTint; Icon: LucideIcon }> = {
  payment: { tint: "green", Icon: CreditCard },
  refund: { tint: "blue", Icon: RotateCcw },
  discount: { tint: "yellow", Icon: Percent },
  adjustment: { tint: "gray", Icon: SlidersHorizontal },
};

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
  // The ledger is the business's: its credit is the customer paying. The customer reads it the other
  // way round, so a payment is money out (−) and a refund or discount is money back to them (+, green).
  const toCustomer = tx.direction === "debit";
  const method = tx.payment ? paymentMethodLabel(tx.payment) : null;
  const details: { label: string; value: ReactNode }[] = [
    tx.orderDeploymentId ? { label: "Order", value: tx.orderDeploymentId } : null,
    method ? { label: "Paid with", value: method } : null,
    tx.payment?.providerRef ? { label: "Transaction ID", value: <CopyValue label="Transaction ID" value={tx.payment.providerRef} /> } : null,
    tx.payment?.reference ? { label: "Your reference", value: tx.payment.reference } : null,
    tx.memo ? { label: "Note", value: tx.memo } : null,
    { label: "Receipt no.", value: <CopyValue label="Receipt number" value={tx.publicId} /> },
  ].filter((d) => d != null);
  const { tint, Icon } = TYPE_STYLE[tx.type];
  return (
    <div>
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <IconTile tint={tint}><Icon /></IconTile>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">
              {typeLabel(tx.type)}
              {method ? <span className="font-normal text-[var(--muted-foreground)]"> · {method}</span> : null}
            </p>
            <p className="text-[13px] tabular-nums text-[var(--muted-foreground)]">
              {formatEpoch(tx.createdAt, { mode: "datetime", timeZone: tz })}
              {tx.orderDeploymentId ? ` · ${tx.orderDeploymentId}` : ""}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1">
            <span className={`text-[15px] font-semibold tabular-nums ${toCustomer ? "text-ok" : "text-[var(--foreground)]"}`}>
              {toCustomer ? "+" : "−"}
              {formatDollars(tx.amount, currency)}
            </span>
            <ChevronDown aria-hidden className="text-muted-foreground size-4 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
          </span>
        </summary>
        <dl className="mx-4 mb-3 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 rounded-2xl bg-[color-mix(in_oklch,var(--foreground)_6%,transparent)] px-3 py-2 text-sm">
          {details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-muted-foreground text-xs">{d.label}</dt>
              <dd className="flex min-h-9 min-w-0 items-center justify-end text-right">{d.value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
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
  const tz = useTimezone();
  return (
    <div className="flex flex-col gap-4">
      {/* Stays while a filter is on, so an empty filtered result can still be cleared. */}
      {(total > 0 || filtered) && <FilterBar spec={MONEY_LEDGER_FACETS} />}
      {items.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="size-6" />}
          title="No transactions yet"
          body="Payments, refunds, and discounts will appear here."
          action={<Link href="/me/renew" className={buttonClass({ variant: "outline" })}>Renew plan</Link>}
        />
      ) : (
        groupByMonth(items, (tx) => tx.createdAt, tz).map((g) => (
          <section key={g.key} aria-label={g.label}>
            <GroupHeader>{g.label}</GroupHeader>
            <ListGroup>
              {g.items.map((tx) => (
                <MoneyTxRow key={tx.publicId} tx={tx} currency={currency} />
              ))}
            </ListGroup>
          </section>
        ))
      )}
      {total > 0 && <QuietPagination page={page} size={size} total={total} />}
    </div>
  );
}

export function TransactionsListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-28 rounded-full" />
      <Skeleton className="h-[168px] w-full rounded-3xl" />
    </div>
  );
}
