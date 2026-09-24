"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { ResponsiveDialog } from "@/components/ds";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import { PaymentStatusPill } from "./payment-status-pill";
import { PAYMENT_METHOD_OPTIONS, type PaymentRow } from "./payment-facets";

const methodLabel = (m: string) => PAYMENT_METHOD_OPTIONS.find((o) => o.value === m)?.label ?? m;

/** Read-only view of one payment row; `footer` carries the caller's actions (e.g. approve/reject). */
export function PaymentDetailDialog({
  payment,
  onOpenChange,
  footer,
}: {
  payment: PaymentRow | null;
  onOpenChange: (open: boolean) => void;
  footer?: ReactNode;
}) {
  const tz = useTimezone();
  const when = (t: number | null) => (t ? formatEpoch(t, { mode: "datetime", timeZone: tz }) : null);

  return (
    <ResponsiveDialog
      open={payment != null}
      onOpenChange={onOpenChange}
      title="Payment details"
      description={payment?.publicId}
      footer={payment && footer}
    >
      {payment && (
        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
            <div>
              <p className="text-muted-foreground text-xs">Amount</p>
              <p className="text-2xl font-semibold tabular-nums">{formatMoney(Number(payment.amount))}</p>
            </div>
            <PaymentStatusPill status={payment.status} />
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Field label="Order">
              <Link href={`/dashboard/orders/${payment.orderPublicId}`} className="inline-flex items-center gap-1 hover:underline">
                {payment.orderPublicId} <ExternalLinkIcon className="size-3.5" />
              </Link>
            </Field>
            <Field label="Customer">
              <span className="block">{payment.name ?? "-"}</span>
              {payment.email && <span className="text-muted-foreground block">{payment.email}</span>}
              {payment.phone && <span className="text-muted-foreground block">{payment.phone}</span>}
            </Field>
            <Field label="Method">{methodLabel(payment.method)}</Field>
            <Field label="Reference">
              <span className="font-mono text-xs break-all">{payment.reference ?? "-"}</span>
            </Field>
            <Field label="Created">{when(payment.createdAt)}</Field>
            {payment.claimedAt && <Field label="Claimed">{when(payment.claimedAt)}</Field>}
            {payment.capturedAt && <Field label="Captured">{when(payment.capturedAt)}</Field>}
            {payment.note && <Field label="Note">{payment.note}</Field>}
          </dl>

          {payment.proofThumb && (
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs">Proof</p>
              <a href={payment.proofHref ?? payment.proofThumb} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={payment.proofThumb}
                  alt={payment.proofName ?? "Payment proof"}
                  className="max-h-72 w-full rounded-md border object-contain"
                />
              </a>
              <p className="text-muted-foreground text-xs">Tap the image to open the full-size original.</p>
            </div>
          )}
        </div>
      )}
    </ResponsiveDialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
