"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { makeImageThumbnail } from "@/components/ds";
import { claimPaymentAction } from "@/app/(customer)/me/wallet/actions";
import type { ClaimPaymentContext } from "@/lib/services/orders.service";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

function formatDollars(amount: string, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(Number(amount));
}

/**
 * Manual payment claim: instructions + optional/required reference & screenshot.
 * Used on activate (post-checkout) and Finances → Bills.
 */
export function ClaimPayment({
  ctx,
  currency = "CAD",
  onDone,
}: {
  ctx: ClaimPaymentContext;
  currency?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const claimable =
    ctx.status === "awaiting_payment" ||
    ctx.status === "rejected" ||
    ctx.status === "pending_verification";

  if (!claimable) {
    return null;
  }

  function pickFile(f: File | null) {
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
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
    setPreview(URL.createObjectURL(f));
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
        await claimPaymentAction(ctx.paymentPublicId, form);
        toast("Payment submitted — we'll confirm it shortly");
        onDone?.();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not submit payment");
      }
    });
  }

  return (
    <div className="space-y-4 text-left">
      <div className="space-y-1">
        <p className="font-medium">{ctx.methodLabel}</p>
        <p className="text-muted-foreground text-sm">
          Amount due: <span className="text-foreground font-semibold tabular-nums">{formatDollars(ctx.amount, currency)}</span>
        </p>
      </div>

      {(ctx.payeeHandle || ctx.instructions) && (
        <div className="rounded-lg bg-muted/50 space-y-1 p-3 text-sm">
          {ctx.payeeHandle && (
            <p>
              Send to: <span className="font-medium">{ctx.payeeHandle}</span>
            </p>
          )}
          {ctx.instructions && <p className="whitespace-pre-wrap text-muted-foreground">{ctx.instructions}</p>}
          <p className="text-muted-foreground">
            Include reference: <span className="text-foreground font-mono font-medium">{ctx.referenceHint}</span>
          </p>
        </div>
      )}

      {ctx.rejectNote && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          Previous claim rejected: {ctx.rejectNote}. Please re-submit.
        </p>
      )}

      {ctx.status === "pending_verification" && (
        <p className="text-muted-foreground text-sm">
          Already submitted — you can update your reference or screenshot below.
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
        {preview ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Payment proof preview" className="size-16 rounded-md border object-cover" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
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
            className="border-dashed text-muted-foreground hover:bg-muted/40 flex flex-col items-center gap-2 rounded-lg border p-4 text-sm"
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

      <Button onClick={submit} disabled={pending} className="w-full sm:w-auto">
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
