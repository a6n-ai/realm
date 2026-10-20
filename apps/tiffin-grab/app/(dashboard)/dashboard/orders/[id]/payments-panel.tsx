"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckIcon, CopyIcon, CreditCardIcon, ExternalLinkIcon, MailIcon, RefreshCwIcon, Undo2Icon } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@foundry/commons";
import { Button } from "@foundry/ui/button";
import { Badge } from "@/components/reui/badge";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Separator } from "@foundry/ui/separator";
import { ClaimPayment } from "@/components/customer/wallet/claim-payment";
import type { ClaimPaymentContext, OrderPaymentDetail } from "@/lib/services/orders.service";
import type { OrderPricingSnapshot } from "@/lib/pricing/types";
import { formatEpoch } from "@/lib/format/datetime";
import { ResponsiveDialog } from "@/components/ds";
import { cancelAddonLinkAction, regenerateAddonLinkAction, rejectPaymentAction, sendPaymentReminderAction, verifyPaymentAction } from "./actions";
import { ReferenceEditor } from "./reference-editor";
import { chargeSavedCardAction, checkStatusAction, refundAction } from "../../payments/stripe/actions";

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
    case "stripe":
      return "Card (Stripe)";
    default: {
      const _exhaustive: never = method;
      return _exhaustive;
    }
  }
}

function isSettled(status: OrderPaymentDetail["status"]): boolean {
  return status === "paid" || status === "simulated_paid";
}

// Non-card payments are paid on the activate page; card payments have their own pay link (built server-side).
function activateUrl(deploymentId: string): string {
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
  payLink,
  now,
  currency,
  timezone,
  claimCtx,
  taxLines,
  canRefund,
  canCharge,
  canCheck,
}: {
  orderId: string;
  deploymentId: string;
  taxLines: { name: string; ratePct: number; amount: number }[];
  canRefund: boolean;
  canCharge: boolean;
  canCheck: boolean;
  payment: OrderPaymentDetail;
  /** Card payments only: the customer's pay page. */
  payLink: string | undefined;
  now: number;
  currency: string;
  timezone: string;
  /** Staff-on-behalf claim form when the payment still needs a customer claim. */
  claimCtx: ClaimPaymentContext | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejectNote, setRejectNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const isCard = payment.method === "stripe";
  const isAddon = payment.addonRequest != null;
  // expiresAt 0 is a link staff cancelled or replaced: it is void and can never be paid.
  const isVoid = isAddon && payment.expiresAt === 0 && !isSettled(payment.status);
  // A void link a late webhook still charged: the money is in, the add-ons are not applied.
  const refundNeeded = isAddon && payment.expiresAt === 0 && isSettled(payment.status);
  const expired = isAddon && payment.expiresAt != null && payment.expiresAt <= now;
  const openLink = isAddon && payment.status === "awaiting_payment" && !expired;
  const unpaid = (payment.status === "awaiting_payment" || payment.status === "rejected") && (!isAddon || openLink);

  const canVerify =
    !isCard && (payment.status === "pending_verification" || payment.status === "awaiting_payment");
  const canReject = !isCard && payment.status === "pending_verification";
  const canShareLink = isAddon
    ? openLink
    : payment.status === "awaiting_payment" ||
      payment.status === "pending_verification" ||
      payment.status === "rejected";
  const canRemind = isAddon ? openLink : payment.status === "awaiting_payment" || payment.status === "rejected";
  const canRegenerate = isAddon && payment.status === "awaiting_payment" && expired && !isVoid;
  const canCancel = isAddon && payment.status === "awaiting_payment" && !isVoid;
  const shareUrl = (): string => payLink ?? activateUrl(deploymentId);
  const canClaim =
    claimCtx != null &&
    (payment.status === "awaiting_payment" || payment.status === "rejected");

  const fmt = (ms: number) => formatEpoch(ms, { mode: "datetime", timeZone: timezone });

  function verify() {
    start(async () => {
      try {
        const res = await verifyPaymentAction(orderId, payment.publicId);
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
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
        const res = await rejectPaymentAction(orderId, payment.publicId, rejectNote.trim());
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
        setShowReject(false);
        setRejectNote("");
        toast("Payment rejected");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not reject payment");
      }
    });
  }

  function remind() {
    start(async () => {
      const res = await sendPaymentReminderAction(orderId, payment.publicId);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Payment reminder emailed", { description: "If it doesn't arrive, ask the customer to check spam." });
      router.refresh();
    });
  }

  function checkStatus() {
    start(async () => {
      const res = await checkStatusAction(payment.publicId);
      if ("error" in res) return void toast.error(res.error);
      (res.settled ? toast.success : toast)(res.message);
      router.refresh();
    });
  }

  function chargeCard() {
    start(async () => {
      const res = await chargeSavedCardAction(payment.publicId);
      if ("error" in res) return void toast.error(res.error);
      (res.kind === "succeeded" ? toast.success : toast)(res.message || res.kind);
      router.refresh();
    });
  }

  function refund() {
    start(async () => {
      const res = await refundAction(payment.publicId, refundAmount, refundReason);
      if ("error" in res) return void toast.error(res.error);
      toast.success(res.message ?? "Refund requested");
      setShowRefund(false);
      setRefundAmount("");
      setRefundReason("");
      router.refresh();
    });
  }

  function regenerate() {
    start(async () => {
      const res = await regenerateAddonLinkAction(orderId, payment.publicId);
      if ("error" in res) return void toast.error(res.error);
      toast.success("New payment link created");
      router.refresh();
    });
  }

  function cancelLink() {
    start(async () => {
      const res = await cancelAddonLinkAction(orderId, payment.publicId);
      if ("error" in res) return void toast.error(res.error);
      setShowCancel(false);
      toast.success("Payment link cancelled");
      router.refresh();
    });
  }

  async function copyPayLink() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      toast.success("Customer payment link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-3" data-testid="payment-row">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium tabular-nums">{formatMoney(Number(payment.amount), currency)}</span>
            <Badge variant="secondary">{isVoid ? "Void" : statusLabel(payment.status)}</Badge>
            <span className="text-muted-foreground text-xs uppercase tracking-wide">
              {methodLabel(payment.method)}
            </span>
            {isAddon && <Badge variant="outline">Add-ons</Badge>}
            {refundNeeded && <Badge variant="destructive-light">Refund needed</Badge>}
            {isAddon && payment.status === "awaiting_payment" && !isVoid &&
              (expired ? (
                <Badge variant="warning-light">Expired</Badge>
              ) : (
                payment.expiresAt != null && <span className="text-muted-foreground text-xs">Expires {fmt(payment.expiresAt)}</span>
              ))}
          </div>
          <p data-testid="payment-public-id" className="text-muted-foreground font-mono text-xs">{payment.publicId}</p>
          {(payment.reference || payment.method !== "simulated") && (
            <ReferenceEditor orderId={orderId} paymentId={payment.publicId} reference={payment.reference} allowAdd={payment.method !== "simulated"} />
          )}
          {payment.note && payment.status === "rejected" && !isVoid && (
            <p className="text-destructive text-sm">Rejected: {payment.note}</p>
          )}
          {isVoid && payment.note && <p className="text-muted-foreground text-sm">{payment.note}</p>}
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
                {copied ? "Copied" : isCard ? "Copy link" : "Copy pay link"}
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={payLink ?? activateUrl(deploymentId)} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon data-icon="inline-start" />
                  Open
                </a>
              </Button>
            </>
          )}
          {isCard && canCheck && payment.providerRef && !isSettled(payment.status) && payment.status !== "refunded" && (
            <Button size="sm" variant="outline" disabled={pending} onClick={checkStatus}>
              <RefreshCwIcon data-icon="inline-start" />
              Check status
            </Button>
          )}
          {isCard && unpaid && canCharge && (
            <Button size="sm" variant="outline" disabled={pending} onClick={chargeCard}>
              <CreditCardIcon data-icon="inline-start" />
              Charge saved card
            </Button>
          )}
          {isCard && payment.status === "paid" && canRefund && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setShowRefund((v) => !v)}>
              <Undo2Icon data-icon="inline-start" />
              Refund
            </Button>
          )}
          {canRemind && (
            <Button size="sm" variant="outline" disabled={pending} onClick={remind}>
              <MailIcon data-icon="inline-start" />
              Email reminder
            </Button>
          )}
          {canRegenerate && (
            <Button size="sm" disabled={pending} onClick={regenerate}>
              <RefreshCwIcon data-icon="inline-start" />
              Regenerate link
            </Button>
          )}
          {canCancel && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setShowCancel(true)}>
              Cancel
            </Button>
          )}
          {canVerify && (
            <Button size="sm" disabled={pending} onClick={verify}>
              Approve payment
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

      {isCard && (
        <div className="space-y-1 border-t pt-2">
          <MetaRow label="Card">{payment.cardLast4 ? `${payment.cardBrand ?? "card"} ••${payment.cardLast4}` : "-"}</MetaRow>
          {Number(payment.surchargeAmount) > 0 && (
            <MetaRow label="Card surcharge">{formatMoney(Number(payment.surchargeAmount), currency)}</MetaRow>
          )}
          {taxLines.map((t) => (
            <MetaRow key={t.name} label={`${t.name} (${t.ratePct}%)`}>{formatMoney(t.amount, currency)}</MetaRow>
          ))}
          {payment.taxSource && (
            <MetaRow label="Tax source">
              <Badge variant={payment.taxSource === "fallback" ? "outline" : "secondary"} className="text-[0.65rem]">{payment.taxSource}</Badge>
            </MetaRow>
          )}
        </div>
      )}

      <div className="space-y-1 border-t pt-2">
        <MetaRow label="Recorded">{fmt(payment.createdAt)}</MetaRow>
        {payment.claimedAt != null && <MetaRow label="Claimed">{fmt(payment.claimedAt)}</MetaRow>}
        {payment.capturedAt != null && <MetaRow label="Verified">{fmt(payment.capturedAt)}</MetaRow>}
      </div>

      {payment.proofThumbUrl ? (
        <div className="space-y-1.5 border-t pt-3">
          <p className="text-sm font-medium">Payment screenshot</p>
          <a
            href={payment.proofHref ?? payment.proofThumbUrl}
            target="_blank"
            rel="noreferrer"
            className="group inline-block"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={payment.proofThumbUrl}
              alt={payment.proof?.name ?? "Payment proof"}
              className="max-h-64 w-auto max-w-full rounded-md border object-contain transition-opacity group-hover:opacity-90"
            />
            <span className="text-primary mt-1 inline-flex items-center gap-1 text-xs underline-offset-2 group-hover:underline">
              <ExternalLinkIcon className="size-3" aria-hidden />
              Open full size
            </span>
          </a>
        </div>
      ) : payment.method === "etransfer" && payment.status === "pending_verification" ? (
        <p className="text-muted-foreground border-t pt-3 text-sm">No screenshot uploaded. Match the reference against the bank deposit before approving.</p>
      ) : null}

      {canClaim && claimCtx && (
        <div className="border-t pt-3" data-testid="admin-payment-claim">
          <p className="mb-3 text-sm font-medium">Record payment (staff on behalf)</p>
          <ClaimPayment ctx={claimCtx} currency={currency} onDone={() => router.refresh()} />
        </div>
      )}

      <ResponsiveDialog
        open={showCancel}
        onOpenChange={(o) => {
          if (!pending) setShowCancel(o);
        }}
        title="Cancel this payment link?"
        description="The customer will no longer be able to pay it. Nothing is added to the plan."
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setShowCancel(false)}>
              Keep link
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={cancelLink}>
              {pending ? "Cancelling…" : "Cancel link"}
            </Button>
          </div>
        }
      >
        <p className="text-muted-foreground text-sm">{formatMoney(Number(payment.amount), currency)} for add-ons.</p>
      </ResponsiveDialog>

      {showRefund && (
        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <div className="grid w-40 gap-1.5">
            <Label htmlFor={`refund-amt-${payment.publicId}`} className="text-xs text-muted-foreground">Amount (blank = full)</Label>
            <Input id={`refund-amt-${payment.publicId}`} inputMode="decimal" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} disabled={pending} />
          </div>
          <div className="grid min-w-[12rem] flex-1 gap-1.5">
            <Label htmlFor={`refund-why-${payment.publicId}`} className="text-xs text-muted-foreground">Reason</Label>
            <Input id={`refund-why-${payment.publicId}`} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} disabled={pending} />
          </div>
          <Button size="sm" variant="destructive" disabled={pending} onClick={refund}>Confirm refund</Button>
        </div>
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
  payLinks = {},
  now,
  claimContexts = {},
  canRefund = false,
  canCharge = false,
  canCheck = false,
}: {
  orderId: string;
  deploymentId: string;
  orderTotal: number;
  currency: string;
  timezone: string;
  checkoutMethodLabel: string | null;
  pricingSnapshot: unknown;
  payments: OrderPaymentDetail[];
  /** paymentPublicId → customer pay page, for card payments. */
  payLinks?: Record<string, string>;
  /** Server time, so expiry reads the same on first paint (no clock in the client). */
  now: number;
  /** paymentPublicId → claim form context for staff-on-behalf uploads. */
  claimContexts?: Record<string, ClaimPaymentContext>;
  canRefund?: boolean;
  canCheck?: boolean;
  /** finance:charge and the customer has a saved Stripe customer. */
  canCharge?: boolean;
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
            payLink={payLinks[p.publicId]}
            now={now}
            currency={currency}
            timezone={timezone}
            claimCtx={claimContexts[p.publicId] ?? null}
            taxLines={snap?.taxLines ?? []}
            canRefund={canRefund}
            canCharge={canCharge}
            canCheck={canCheck}
          />
        ))}
      </div>
    </div>
  );
}
