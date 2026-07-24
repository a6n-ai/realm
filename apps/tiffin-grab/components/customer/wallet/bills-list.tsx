"use client";

import { useState, useTransition } from "react";
import { Badge } from "@realm/ui/badge";
import { Button } from "@realm/ui/button";
import { Skeleton } from "@realm/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@realm/ui/dialog";
import { ListPagination, OrderStatusBadge } from "@/components/ds";
import { Reveal, LottieEmptyState } from "@/components/motion";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { CustomerBill } from "@/lib/services/customer-finances.service";
import type { ClaimPaymentContext } from "@/lib/services/orders.service";
import { loadClaimPaymentContext } from "@/app/(customer)/me/wallet/actions";
import { ClaimPayment } from "./claim-payment";

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
    case "paid":
      return "Paid";
    case "pending":
      return "Pending";
    case "awaiting_payment":
      return "Awaiting payment";
    case "pending_verification":
      return "Verifying";
    case "rejected":
      return "Rejected";
    case "refunded":
      return "Refunded";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function isClaimable(status: CustomerBill["payments"][number]["status"]): boolean {
  return status === "awaiting_payment" || status === "rejected" || status === "pending_verification";
}

function BillRow({
  bill,
  currency,
  onClaim,
}: {
  bill: CustomerBill;
  currency: string;
  onClaim: (paymentPublicId: string) => void;
}) {
  const tz = useTimezone();
  const claimable = bill.payments.find((p) => isClaimable(p.status));

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
          {claimable && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onClaim(claimable.publicId)}
            >
              {claimable.status === "pending_verification" ? "Update claim" : "I've sent it"}
            </Button>
          )}
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
  const [claimCtx, setClaimCtx] = useState<ClaimPaymentContext | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);

  function openClaim(paymentPublicId: string) {
    setLoadError(null);
    start(async () => {
      try {
        const ctx = await loadClaimPaymentContext(paymentPublicId);
        setClaimCtx(ctx);
        setOpen(true);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Could not open payment claim");
      }
    });
  }

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
      {loadError && <p className="text-destructive text-sm">{loadError}</p>}
      {groups.map((g) => (
        <section key={g.key} className="space-y-1">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {g.label}
          </h2>
          <Reveal.Group className="divide-y">
            {g.bills.map((bill) => (
              <BillRow key={bill.publicId} bill={bill} currency={currency} onClaim={openClaim} />
            ))}
          </Reveal.Group>
        </section>
      ))}
      <ListPagination page={page} size={size} total={total} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm payment</DialogTitle>
          </DialogHeader>
          {pending && !claimCtx ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : claimCtx ? (
            <ClaimPayment
              ctx={claimCtx}
              currency={currency}
              onDone={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
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
