"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Clock, Download, FileText, Mail, RotateCcw, XCircle, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, EmptyState, Pill, Skeleton, type Tone } from "@/components/customer/kit";
import { buttonClass } from "@/components/customer/kit/button-class";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@foundry/ui/dialog";
import { ListPagination, OrderStatusBadge } from "@/components/ds";
import { Reveal } from "@/components/motion";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { CustomerBill } from "@/lib/services/customer-finances.service";
import type { ClaimPaymentContext } from "@/lib/services/orders.service";
import { emailReceiptAction, loadClaimPaymentContext } from "@/app/(customer)/me/wallet/actions";
import { ClaimPayment } from "./claim-payment";
import { cardBrandLabel } from "@/lib/billing/payment-labels";

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

type PayStatus = CustomerBill["payments"][number]["status"];

function paymentPill(status: PayStatus): { label: string; tone: Tone; Icon: LucideIcon; hint?: string } {
  switch (status) {
    case "simulated_paid":
    case "paid":
      return { label: "Paid", tone: "ok", Icon: Check };
    case "pending":
      return { label: "Pending", tone: "hold", Icon: Clock };
    case "awaiting_payment":
      return { label: "Awaiting payment", tone: "hold", Icon: Clock };
    case "pending_verification":
      return { label: "Verifying", tone: "up", Icon: Clock, hint: "We're checking your e-Transfer." };
    case "rejected":
      return { label: "Rejected", tone: "hold", Icon: XCircle };
    case "refunded":
      return { label: "Refunded", tone: "soft", Icon: RotateCcw };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

const isPaid = (s: PayStatus) => s === "paid" || s === "simulated_paid";

// Date-only strings: format in UTC so the day never shifts with the viewer's zone.
function planRange(start: string, last: string | null): string {
  const d = (v: string, year: boolean) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) }).format(new Date(`${v}T00:00:00Z`));
  if (!last || last === start) return d(start, true);
  return `${d(start, start.slice(0, 4) !== last.slice(0, 4))} – ${d(last, true)}`;
}

function isClaimable(p: CustomerBill["payments"][number]): boolean {
  if (p.method === "stripe") return false;
  return p.status === "awaiting_payment" || p.status === "rejected" || p.status === "pending_verification";
}

function cardDetail(bill: CustomerBill, p: CustomerBill["payments"][number]): string | null {
  if (p.method !== "stripe") return null;
  const fee = Number(p.surchargeAmount);
  const parts = [
    p.cardLast4 ? `${cardBrandLabel(p.cardBrand)} ••${p.cardLast4}` : null,
    fee > 0 ? `Credit card fee $${fee.toFixed(2)}` : null,
    ...(p.addonLines
      ? p.addonLines.map((l) => `${l.label} $${l.amount.toFixed(2)}`)
      : bill.taxLines.map((t) => `${t.name} ${t.ratePct}% $${t.amount.toFixed(2)}`)),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

// The receipt route is plain GET (not a page), so a native anchor, never <Link>.
function ReceiptActions({ orderPublicId }: { orderPublicId: string }) {
  const [sending, start] = useTransition();
  const email = () =>
    start(async () => {
      const res = await emailReceiptAction(orderPublicId);
      if ("error" in res) toast.error(res.error);
      else toast("Receipt sent to your email");
    });
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <a href={`/api/receipts/${encodeURIComponent(orderPublicId)}`} download className={buttonClass({ variant: "quiet", pill: true, className: "gap-1.5 text-sm" })}>
        <Download aria-hidden className="size-4" />
        Download receipt
      </a>
      <Button type="button" variant="quiet" pill className="gap-1.5 text-sm" pending={sending} onClick={email}>
        <Mail aria-hidden className="size-4" />
        Email receipt
      </Button>
    </div>
  );
}

function BillRow({
  bill,
  currency,
  onClaim,
  cardAvailable,
}: {
  bill: CustomerBill;
  currency: string;
  cardAvailable: boolean;
  onClaim: (paymentPublicId: string) => void;
}) {
  const tz = useTimezone();
  const claimable = bill.payments.find(isClaimable);
  const payable = cardAvailable ? bill.payments.find((p) => p.cardPayable) : undefined;
  const hints = [...new Set(bill.payments.map((p) => paymentPill(p.status).hint).filter((h): h is string => !!h))];
  const details = bill.payments.map((p) => cardDetail(bill, p)).filter(Boolean);

  return (
    <Reveal className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-medium">
          {bill.planName} · {bill.mealSizeName}
        </p>
        <p className="text-xs tabular-nums">{planRange(bill.startDate, bill.lastDeliveryDate)}</p>
        <p className="text-muted-foreground truncate text-xs tabular-nums">
          {bill.deploymentId}
          {" · "}
          {formatEpoch(bill.createdAt, { mode: "date", timeZone: tz })}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <OrderStatusBadge status={bill.status} />
          {bill.payments.map((p) => {
            const { label, tone, Icon } = paymentPill(p.status);
            return (
              <Pill key={p.publicId} tone={tone} size="sm" icon={<Icon className="size-3" aria-hidden />}>
                {label}
              </Pill>
            );
          })}
          {!cardAvailable && bill.payments.some((p) => p.cardPayable) && (
            <span className="text-muted-foreground text-xs">Card payments are paused right now. Please contact us.</span>
          )}
          {payable && (
            <Link
              href={`/me/pay/${payable.publicId}`}
              className={buttonClass({ variant: "primary" })}
            >
              Pay by card
            </Link>
          )}
          {claimable && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onClaim(claimable.publicId)}
            >
              {claimable.status === "pending_verification" ? "Update claim" : "I've sent it"}
            </Button>
          )}
        </div>
        {hints.map((h) => (
          <p key={h} className="text-muted-foreground text-xs">{h}</p>
        ))}
        {details.map((d) => (
          <p key={d} className="text-muted-foreground text-xs">{d}</p>
        ))}
        <ReceiptActions orderPublicId={bill.publicId} />
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
  cardAvailable = false,
}: {
  items: CustomerBill[];
  page: number;
  size: number;
  total: number;
  currency: string;
  cardAvailable?: boolean;
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
      <EmptyState
        icon={<FileText className="size-6" />}
        title="No bills yet"
        body="Subscription receipts will appear here after you place an order."
      />
    );
  }

  const groups: { key: string; label: string; bills: CustomerBill[]; paid: number }[] = [];
  for (const bill of items) {
    const key = monthKey(bill.createdAt, tz);
    const last = groups[groups.length - 1];
    const paid = bill.payments.filter((p) => isPaid(p.status)).reduce((n, p) => n + Number(p.amount), 0);
    if (last?.key === key) {
      last.bills.push(bill);
      last.paid += paid;
    } else {
      groups.push({ key, label: monthLabel(bill.createdAt, tz), bills: [bill], paid });
    }
  }

  return (
    <div className="space-y-6">
      {loadError && <p className="text-destructive text-sm">{loadError}</p>}
      {groups.map((g) => (
        <section key={g.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {g.label}
            </h2>
            {g.paid > 0 && (
              <span className="text-muted-foreground text-xs tabular-nums">
                Paid {formatDollars(String(g.paid), currency)}
              </span>
            )}
          </div>
          <Reveal.Group className="divide-y">
            {g.bills.map((bill) => (
              <BillRow key={bill.publicId} bill={bill} currency={currency} cardAvailable={cardAvailable} onClaim={openClaim} />
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
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}
