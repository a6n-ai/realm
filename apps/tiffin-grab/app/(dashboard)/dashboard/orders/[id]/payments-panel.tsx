"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { formatMoney } from "@realm/commons";
import { Button } from "@realm/ui/button";
import { Badge } from "@realm/ui/badge";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import type { OrderPaymentDetail } from "@/lib/services/orders.service";
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

function PaymentRow({
  orderId,
  payment,
}: {
  orderId: string;
  payment: OrderPaymentDetail;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejectNote, setRejectNote] = useState("");
  const [showReject, setShowReject] = useState(false);

  const canVerify =
    payment.status === "pending_verification" || payment.status === "awaiting_payment";
  const canReject = payment.status === "pending_verification";

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

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium tabular-nums">{formatMoney(Number(payment.amount))}</span>
            <Badge variant="secondary">{statusLabel(payment.status)}</Badge>
            <span className="text-muted-foreground text-xs uppercase tracking-wide">
              {methodLabel(payment.method)}
            </span>
          </div>
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

      {payment.proofThumbUrl && (
        <a
          href={payment.proofHref ?? payment.proofThumbUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={payment.proofThumbUrl}
            alt={payment.proof?.name ?? "Payment proof"}
            className="size-24 rounded-md border object-cover"
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
  payments,
}: {
  orderId: string;
  payments: OrderPaymentDetail[];
}) {
  if (payments.length === 0) {
    return <p className="text-muted-foreground text-sm">No payments recorded.</p>;
  }

  return (
    <div className="space-y-3">
      {payments.map((p) => (
        <PaymentRow key={p.publicId} orderId={orderId} payment={p} />
      ))}
    </div>
  );
}
