"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { UploadIcon, XIcon } from "lucide-react";
import { ResponsiveDialog } from "@foundry/design-system";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Button } from "@/components/customer/kit";
import { makeImageThumbnail } from "@/components/ds";
import { claimPaymentAction } from "@/app/(customer)/me/wallet/actions";
import { sanitizeClientError } from "@/lib/format/client-error";
import { PaymentInstructions } from "@/components/payment-instructions";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

export type EtransferPayment = {
  paymentPublicId: string;
  deploymentId: string;
  amount: number;
  payeeHandle: string | null;
  instructions: string | null;
  requireProof: boolean;
};

export function EtransferDialog({ open, onOpenChange, payment, renderSubmitted, onClosedWithoutProof }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: EtransferPayment;
  renderSubmitted: () => ReactNode;
  onClosedWithoutProof?: () => void;
}) {
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const amount = `$${payment.amount.toFixed(2)}`;

  function handleOpenChange(next: boolean) {
    if (pending) return;
    if (!next && !submitted) onClosedWithoutProof?.();
    onOpenChange(next);
  }

  function pickFile(f: File | null) {
    setError(null);
    setFile(null);
    if (!f) return;
    if (!ACCEPT.includes(f.type)) return setError("Only PNG, JPEG, WebP or GIF images are allowed");
    if (f.size > MAX_BYTES) return setError("Screenshot must be 5 MB or smaller");
    setFile(f);
  }

  function submit() {
    setError(null);
    if (payment.requireProof && !file) return setError("A payment screenshot is required");
    if (!reference.trim() && !file) return setError("Add a payment reference or upload a screenshot");
    start(async () => {
      try {
        const form = new FormData();
        if (reference.trim()) form.set("reference", reference.trim());
        if (file) {
          const thumb = await makeImageThumbnail(file);
          form.set("proof", file);
          form.set("proof_thumb", thumb, thumb.name);
        }
        const res = await claimPaymentAction(payment.paymentPublicId, form);
        if ("error" in res) return setError(sanitizeClientError(res.error));
        setSubmitted(true);
      } catch (e) {
        setError(sanitizeClientError(e, "Could not submit payment. Please try again."));
      }
    });
  }

  if (submitted) {
    return (
      <ResponsiveDialog open={open} onOpenChange={handleOpenChange} title="e-Transfer submitted" direction="bottom">
        {renderSubmitted()}
      </ResponsiveDialog>
    );
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={handleOpenChange}
      direction="bottom"
      title={`Send ${amount} by e-Transfer`}
      description="Send the e-Transfer from your bank, then upload a screenshot so we can verify it."
      footer={
        <Button variant="primary" size="lg" onClick={submit} pending={pending} disabled={pending} className="w-full sm:w-auto">
          {pending ? "Submitting…" : "I've sent the payment"}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 text-left">
        <p className="text-sm text-muted-foreground">
          Amount: <span className="text-foreground font-semibold tabular-nums">{amount}</span>
        </p>
        <PaymentInstructions
          payeeHandle={payment.payeeHandle}
          instructions={payment.instructions}
          referenceHint={payment.deploymentId}
          className="rounded-lg bg-muted/50 p-4"
        />
        <p className="text-xs text-muted-foreground">Put the reference above in the e-Transfer message.</p>

        <div className="grid gap-1.5">
          <Label htmlFor={`etransfer-ref-${payment.paymentPublicId}`}>Payment reference (optional)</Label>
          <Input
            id={`etransfer-ref-${payment.paymentPublicId}`}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Interac confirmation / reference #"
            disabled={pending}
          />
        </div>

        <div className="grid gap-1.5">
          <Label>
            Screenshot {payment.requireProof ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}
          </Label>
          {file ? (
            <div className="flex items-center gap-2">
              <span className="truncate text-sm">{file.name}</span>
              <Button
                type="button"
                variant="quiet"
                size="lg"
                disabled={pending}
                onClick={() => {
                  pickFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                <XIcon aria-hidden /> Remove
              </Button>
            </div>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:bg-muted/40"
            >
              <UploadIcon className="size-5" aria-hidden />
              <span>Upload payment screenshot</span>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT.join(",")}
            aria-label="Payment screenshot"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </ResponsiveDialog>
  );
}
