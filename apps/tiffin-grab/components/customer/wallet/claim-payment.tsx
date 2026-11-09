"use client";

import { useRef, useState, useTransition } from "react";
import { inStatuses, UNPAID } from "@/lib/payments/status";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClockIcon, Loader2Icon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/customer/kit";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { makeImageThumbnail } from "@/components/ds";
import { claimPaymentAction } from "@/app/(customer)/me/wallet/actions";
import type { ClaimPaymentContext } from "@/lib/payments/verification";
import { sanitizeClientError } from "@foundry/commons/util/client-error";
import { PaymentInstructions } from "@/components/payment-instructions";
import { trackMeta } from "@foundry/meta-pixel/client";
import { gtagEvent } from "@foundry/google-analytics/client";
import { orderSubmittedEventId } from "@/lib/meta/event-ids";
import { formatMoney } from "@/lib/format/money";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Manual payment claim: instructions + optional/required reference & screenshot.
 * Used on activate (post-checkout) and Finances → Bills.
 */
export function ClaimPayment({
  ctx,
  currency,
  onDone,
}: {
  ctx: ClaimPaymentContext;
  currency: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const orderSubmittedPixelFired = useRef(false);

  const claimable = inStatuses(UNPAID, ctx.status);

  if (ctx.status === "pending_verification") {
    return (
      <div className="flex items-start gap-3 text-left">
        <span className="bg-primary/15 text-primary mt-0.5 grid size-9 shrink-0 place-items-center rounded-full">
          <ClockIcon className="size-5" />
        </span>
        <div className="space-y-1">
          <p className="font-semibold">Payment under review</p>
          <p className="text-muted-foreground text-sm">
            We&apos;ve received your {ctx.methodLabel} details for{" "}
            <span className="text-foreground font-medium tabular-nums">{formatMoney(Number(ctx.amount), currency, { narrow: true })}</span>.
            Your plan starts as soon as we confirm it. Nothing else is needed from you.
          </p>
        </div>
      </div>
    );
  }

  if (!claimable) {
    return null;
  }

  function pickFile(f: File | null) {
    setError(null);
    setFile(null);
    if (!f) return;
    if (!ACCEPT.includes(f.type)) {
      setError("Only PNG, JPEG, WebP or GIF images are allowed");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("Screenshot must be 5 MB or smaller");
      return;
    }
    setFile(f);
  }

  function submit() {
    setError(null);
    if (ctx.requireProof && !file) {
      setError("A payment screenshot is required");
      return;
    }
    if (!reference.trim() && !file) {
      setError("Add a payment reference or upload a screenshot");
      return;
    }
    start(async () => {
      try {
        const form = new FormData();
        if (reference.trim()) form.set("reference", reference.trim());
        if (file) {
          const thumb = await makeImageThumbnail(file);
          form.set("proof", file);
          form.set("proof_thumb", thumb, thumb.name);
        }
        const res = await claimPaymentAction(ctx.paymentPublicId, form);
        if ("error" in res) {
          setError(sanitizeClientError(res.error));
          return;
        }
        // Funnel only — Purchase waits for staff verify (server CAPI). Same event_id as claim CAPI.
        if (!orderSubmittedPixelFired.current) {
          orderSubmittedPixelFired.current = true;
          const eventId = orderSubmittedEventId(ctx.paymentPublicId);
          trackMeta(
            "order_submitted",
            { value: Number(ctx.amount), currency, num_items: 1 },
            eventId,
          );
          gtagEvent("order_submitted", {
            transaction_id: ctx.paymentPublicId,
            value: Number(ctx.amount),
            currency,
            payment_type: ctx.methodId,
          });
        }
        toast("Payment submitted — we'll confirm it shortly");
        onDone?.();
        router.refresh();
      } catch (e) {
        setError(sanitizeClientError(e, "Could not submit payment. Please try again."));
      }
    });
  }

  return (
    <div className="space-y-4 text-left">
      <div className="space-y-1">
        <p className="font-medium">{ctx.methodLabel}</p>
        <p className="text-muted-foreground text-sm">
          Amount due: <span className="text-foreground font-semibold tabular-nums">{formatMoney(Number(ctx.amount), currency, { narrow: true })}</span>
        </p>
      </div>

      <PaymentInstructions
        payeeHandle={ctx.payeeHandle}
        instructions={ctx.instructions}
        referenceHint={ctx.referenceHint}
        className="rounded-lg bg-muted/50 p-4"
      />

      {ctx.rejectNote && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          Previous claim rejected: {ctx.rejectNote}. Please re-submit.
        </p>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor={`ref-${ctx.paymentPublicId}`}>Payment reference</Label>
        <Input
          id={`ref-${ctx.paymentPublicId}`}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Interac confirmation / reference #"
          disabled={pending}
        />
      </div>

      <div className="grid gap-1.5">
        <Label>
          Screenshot {ctx.requireProof ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}
        </Label>
        {file ? (
          <div className="flex items-center gap-3">
            <span className="text-sm truncate">{file.name}</span>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                pickFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              <XIcon className="size-4" /> Remove
            </Button>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
            className="c-surface text-muted-foreground flex flex-col items-center gap-2 rounded-2xl bg-foreground/8 p-4 text-sm transition-colors hover:bg-foreground/13"
          >
            <UploadIcon className="size-5" />
            <span>Upload payment screenshot</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(",")}
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button variant="primary" onClick={submit} disabled={pending} className="w-full sm:w-auto">
        {pending ? (
          <>
            <Loader2Icon className="size-4 animate-spin" /> Submitting…
          </>
        ) : (
          "I've sent the payment"
        )}
      </Button>
    </div>
  );
}
