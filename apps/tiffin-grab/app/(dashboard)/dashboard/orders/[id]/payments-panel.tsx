"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState, useTransition } from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@realm/commons";
import { Button } from "@realm/ui/button";
import { Badge } from "@realm/ui/badge";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { Separator } from "@realm/ui/separator";
import type { OrderPaymentDetail } from "@/lib/services/orders.service";
import type { OrderPricingSnapshot } from "@/lib/pricing/types";
import { formatEpoch } from "@/lib/format/datetime";
import { rejectPaymentAction, verifyPaymentAction } from "./actions";

function statusLabel(status: OrderPaymentDetail["status"]): string {
  switch (status) {
    case "simulated_paid":
    case "paid":
      return "Paid";
    case "pending":
      return "Pending";
    case "awaiting_payment":
      return "Awaiting payment";
    case "pending_verification":
      return "Pending verification";
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

function methodLabel(method: OrderPaymentDetail["method"]): string {
  switch (method) {
    case "etransfer":
      return "Interac e-Transfer";
    case "cash":
      return "Cash";
    case "manual":
      return "Manual";
    case "simulated":
      return "Simulated";
    default: {
      const _exhaustive: never = method;
      return _exhaustive;
    }
  }
}

function isSettled(status: OrderPaymentDetail["status"]): boolean {
  return status === "paid" || status === "simulated_paid";
}

function customerPayUrl(deploymentId: string): string {
  const path = `/activate/${deploymentId}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function PaymentSummary({
  orderTotal,
  currency,
  checkoutMethodLabel,
  pendingRedemptions,
  payments,
}: {
  orderTotal: number;
  currency: string;
  checkoutMethodLabel: string | null;
  pendingRedemptions: OrderPricingSnapshot["pendingRedemptions"];
  payments: OrderPaymentDetail[];
}) {
  const paidTotal = payments
    .filter((p) => isSettled(p.status))
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const outstanding = Math.max(0, orderTotal - paidTotal);
  const openPayment = payments.find(
    (p) =>
      p.status === "awaiting_payment" ||
      p.status === "pending_verification" ||
      p.status === "pending",
  );

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-muted-foreground text-xs">Order total</p>
          <p className="text-lg font-semibold tabular-nums">{formatMoney(orderTotal, currency)}</p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">Received</p>
          <p className="font-medium tabular-nums text-ok">{formatMoney(paidTotal, currency)}</p>
        </div>
      </div>
      <Separator />
      <dl className="space-y-1.5">
        {checkoutMethodLabel && (
          <MetaRow label="Checkout method">{checkoutMethodLabel}</MetaRow>
        )}
        {openPayment && (
          <MetaRow label="Open payment">
            <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
              <span className="tabular-nums">{formatMoney(Number(openPayment.amount), currency)}</span>
              <Badge variant="secondary" className="text-[0.65rem]">
                {statusLabel(openPayment.status)}
              </Badge>
            </span>
          </MetaRow>
        )}
        {outstanding > 0 && !openPayment && (
          <MetaRow label="Outstanding">
            <span className="font-medium tabular-nums">{formatMoney(outstanding, currency)}</span>
          </MetaRow>
        )}
        {pendingRedemptions && pendingRedemptions.length > 0 && (
          <MetaRow label="Pending coupons">
            {pendingRedemptions.map((r) => r.code).join(", ")}
          </MetaRow>
        )}
      </dl>
    </div>
  );
}

function PaymentRow({
  orderId,
  deploymentId,
  payment,
  currency,
  timezone,
}: {
  orderId: string;
  deploymentId: string;
  payment: OrderPaymentDetail;
  currency: string;
  timezone: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejectNote, setRejectNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [copied, setCopied] = useState(false);

  const canVerify =
    payment.status === "pending_verification" || payment.status === "awaiting_payment";
  const canReject = payment.status === "pending_verification";
  const canShareLink =
    payment.status === "awaiting_payment" ||
    payment.status === "pending_verification" ||
    payment.status === "rejected";

  const fmt = (ms: number) => formatEpoch(ms, { mode: "datetime", timeZone: timezone });

  function verify() {
    start(async () => {
      try {
        await verifyPaymentAction(orderId, payment.publicId);
        toast("Payment verified");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not verify payment");
      }
    });
  }

  function reject() {
    if (!rejectNote.trim()) {
      toast.error("Add a reason for rejecting");
      return;
    }
    start(async () => {
      try {
        await rejectPaymentAction(orderId, payment.publicId, rejectNote.trim());
        setShowReject(false);
        setRejectNote("");
        toast("Payment rejected");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not reject payment");
      }
    });
  }

  async function copyPayLink() {
    try {
      await navigator.clipboard.writeText(customerPayUrl(deploymentId));
      setCopied(true);
      toast.success("Customer payment link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium tabular-nums">{formatMoney(Number(payment.amount), currency)}</span>
            <Badge variant="secondary">{statusLabel(payment.status)}</Badge>
            <span className="text-muted-foreground text-xs uppercase tracking-wide">
              {methodLabel(payment.method)}
            </span>
          </div>
          <p className="text-muted-foreground font-mono text-xs">{payment.publicId}</p>
          {payment.reference && (
            <p className="text-sm">
              Reference: <span className="font-mono">{payment.reference}</span>
            </p>
          )}
          {payment.note && payment.status === "rejected" && (
            <p className="text-destructive text-sm">Rejected: {payment.note}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canShareLink && (
            <>
              <Button size="sm" variant="outline" onClick={copyPayLink}>
                {copied ? (
                  <CheckIcon data-icon="inline-start" />
                ) : (
                  <CopyIcon data-icon="inline-start" />
                )}
                {copied ? "Copied" : "Copy pay link"}
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={`/activate/${deploymentId}`} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon data-icon="inline-start" />
                  Open
                </a>
              </Button>
            </>
          )}
          {canVerify && (
            <Button size="sm" disabled={pending} onClick={verify}>
              Verify
            </Button>
          )}
          {canReject && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setShowReject((v) => !v)}
            >
              Reject
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1 border-t pt-2">
        <MetaRow label="Recorded">{fmt(payment.createdAt)}</MetaRow>
        {payment.claimedAt != null && <MetaRow label="Claimed">{fmt(payment.claimedAt)}</MetaRow>}
        {payment.capturedAt != null && <MetaRow label="Verified">{fmt(payment.capturedAt)}</MetaRow>}
      </div>

      {payment.proofThumbUrl && (
        <a
          href={payment.proofHref ?? payment.proofThumbUrl}
          target="_blank"
          rel="noreferrer"
          className="relative inline-block size-24 rounded-md border"
        >
          <Image
            src={payment.proofThumbUrl}
            alt={payment.proof?.name ?? "Payment proof"}
            fill
            sizes="96px"
            className="rounded-md object-cover"
          />
        </a>
      )}

      {showReject && (
        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <div className="grid min-w-[12rem] flex-1 gap-1.5">
            <Label htmlFor={`reject-${payment.publicId}`} className="text-xs text-muted-foreground">
              Reason
            </Label>
            <Input
              id={`reject-${payment.publicId}`}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="e.g. Wrong amount / no matching transfer"
              disabled={pending}
            />
          </div>
          <Button size="sm" variant="destructive" disabled={pending} onClick={reject}>
            Confirm reject
          </Button>
        </div>
      )}
    </div>
  );
}

export function PaymentsPanel({
  orderId,
  deploymentId,
  orderTotal,
  currency,
  timezone,
  checkoutMethodLabel,
  pricingSnapshot,
  payments,
}: {
  orderId: string;
  deploymentId: string;
  orderTotal: number;
  currency: string;
  timezone: string;
  checkoutMethodLabel: string | null;
  pricingSnapshot: unknown;
  payments: OrderPaymentDetail[];
}) {
  const snap = pricingSnapshot as OrderPricingSnapshot | null;
  const pendingRedemptions = snap?.pendingRedemptions;

  if (payments.length === 0) {
    return (
      <div className="space-y-3">
        <PaymentSummary
          orderTotal={orderTotal}
          currency={currency}
          checkoutMethodLabel={checkoutMethodLabel}
          pendingRedemptions={pendingRedemptions}
          payments={[]}
        />
        <p className="text-muted-foreground text-sm">No payments recorded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PaymentSummary
        orderTotal={orderTotal}
        currency={currency}
        checkoutMethodLabel={checkoutMethodLabel}
        pendingRedemptions={pendingRedemptions}
        payments={payments}
      />
      <div className="space-y-3">
        <p className="text-sm font-medium">Payment records</p>
        {payments.map((p) => (
          <PaymentRow
            key={p.publicId}
            orderId={orderId}
            deploymentId={deploymentId}
            payment={p}
            currency={currency}
            timezone={timezone}
          />
        ))}
      </div>
    </div>
  );
}
