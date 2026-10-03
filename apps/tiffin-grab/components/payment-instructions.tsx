"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

/**
 * How to pay a manual method (e-Transfer): where to send it, the admin's
 * instructions, and the reference to include — each with a Copy button.
 * The single block used by checkout, admin order create and the claim form
 * (Bills, /activate, deliveries payment-review, admin Payments panel).
 * Never render it inside another button: the copy buttons can't nest.
 */
export function PaymentInstructions({
  payeeHandle,
  instructions,
  referenceHint,
  className = "",
}: {
  payeeHandle?: string | null;
  instructions?: string | null;
  referenceHint?: string | null;
  className?: string;
}) {
  if (!payeeHandle && !instructions && !referenceHint) return null;
  return (
    <div className={`space-y-1.5 text-sm ${className}`}>
      {payeeHandle ? (
        <Row label="Send to" value={payeeHandle} what="email" />
      ) : null}
      {instructions ? <p className="text-muted-foreground whitespace-pre-wrap">{instructions}</p> : null}
      {referenceHint ? (
        <Row label="Include reference" value={referenceHint} what="reference" mono />
      ) : null}
    </div>
  );
}

function Row({ label, value, what, mono = false }: { label: string; value: string; what: string; mono?: boolean }) {
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>
        {label}:{" "}
        <span className={`text-foreground font-semibold break-all ${mono ? "font-mono" : ""}`}>{value}</span>
      </span>
      <CopyValue value={value} what={what} />
    </p>
  );
}

/** Small "Copy" pill; inherits text color so it fits the customer kit and admin alike. */
export function CopyValue({ value, what = "email" }: { value: string; what?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked (permissions/insecure context): the value stays visible to copy by hand.
        }
      }}
      aria-label={copied ? `${what} copied` : `Copy ${what}`}
      className="text-foreground inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border border-current/20 px-2.5 text-xs font-semibold transition-colors hover:bg-current/5"
    >
      {copied ? <CheckIcon className="size-3.5" aria-hidden /> : <CopyIcon className="size-3.5" aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
