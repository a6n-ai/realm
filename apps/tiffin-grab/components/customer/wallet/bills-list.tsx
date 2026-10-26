"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Clock, Download, FileText, Mail, RotateCcw, XCircle, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, EmptyState, IconTile, ListGroup, Pill, Skeleton, type IconTint, type Tone } from "@/components/customer/kit";
import { buttonClass } from "@/components/customer/kit/button-class";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@foundry/ui/dialog";
import { OrderStatusBadge } from "@/components/ds";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { CustomerBill } from "@/lib/services/customer-finances.service";
import type { ClaimPaymentContext } from "@/lib/services/orders.service";
import { emailReceiptAction, loadClaimPaymentContext } from "@/app/(customer)/me/wallet/actions";
import { ClaimPayment } from "./claim-payment";
import { cardBrandLabel } from "@/lib/billing/payment-labels";
import { GroupHeader, QuietPagination, groupByMonth } from "./finance-kit";

function formatDollars(amount: string, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(Number(amount));
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

const BILL_TINT: Record<PayStatus, IconTint> = {
  paid: "green",
  simulated_paid: "green",
  pending: "orange",
  awaiting_payment: "orange",
  pending_verification: "indigo",
  rejected: "red",
  refunded: "gray",
};

// A bill's tile follows its first payment (a bill with no payment rows reads as awaiting).
const billTint = (b: CustomerBill): IconTint => (b.payments[0] ? BILL_TINT[b.payments[0].status] : "orange");

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
    // Icon-only, under the bill's price on the card's right side; the labels stay as their names and hover tips.
    <span className="flex gap-1.5">
      <a href={`/api/receipts/${encodeURIComponent(orderPublicId)}`} download aria-label="Download receipt" title="Download receipt" className={buttonClass({ variant: "quiet", className: "!size-9 !min-h-9 !px-0" })}>
        <Download aria-hidden className="size-[18px]" />
      </a>
      <Button type="button" variant="quiet" aria-label="Email receipt" title="Email receipt" className="!size-9 !min-h-9 !px-0" pending={sending} onClick={email}>
        <Mail aria-hidden className="size-[18px]" />
      </Button>
    </span>
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
    <div className="flex items-start gap-3 px-4 py-3">
      <IconTile tint={billTint(bill)}><FileText /></IconTile>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-[15px] font-semibold">
          {bill.planName} · {bill.mealSizeName}
        </p>
        <p className="text-[13px] tabular-nums">{planRange(bill.startDate, bill.lastDeliveryDate)}</p>
        <p className="truncate text-[13px] tabular-nums text-[var(--muted-foreground)]">
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
              className={buttonClass({ variant: "primary", className: "min-h-9 px-3 text-sm" })}
            >
              Pay by card
            </Link>
          )}
          {claimable && (
            <Button
              type="button"
              variant="outline"
              className="min-h-9 px-3 text-sm"
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
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="text-[15px] font-semibold tabular-nums">{formatDollars(bill.total, currency)}</span>
        <ReceiptActions orderPublicId={bill.publicId} />
      </div>
    </div>
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
        action={<Link href="/subscribe" className={buttonClass({ variant: "outline" })}>Browse plans</Link>}
      />
    );
  }

  const groups = groupByMonth(items, (b) => b.createdAt, tz).map((g) => ({
    ...g,
    paid: g.items.reduce((n, bill) => n + bill.payments.filter((p) => isPaid(p.status)).reduce((m, p) => m + Number(p.amount), 0), 0),
  }));

  return (
    <div className="flex flex-col gap-6">
      {loadError && <p className="text-destructive text-sm">{loadError}</p>}
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label}>
          <GroupHeader note={g.paid > 0 ? `Paid ${formatDollars(String(g.paid), currency)}` : undefined}>{g.label}</GroupHeader>
          <ListGroup>
            {g.items.map((bill) => (
              <BillRow key={bill.publicId} bill={bill} currency={currency} cardAvailable={cardAvailable} onClaim={openClaim} />
            ))}
          </ListGroup>
        </section>
      ))}
      <QuietPagination page={page} size={size} total={total} />

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
      <Skeleton className="h-52 w-full rounded-3xl" />
    </div>
  );
}
