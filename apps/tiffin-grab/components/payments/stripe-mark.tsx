import { STRIPE_MARK_PATH } from "@/lib/payments/stripe-mark-path";

/** Stripe's glyph beside a payment method's name; decorative, the adjacent "Card" text is the label. */
export function StripeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className ?? "size-3.5 shrink-0 fill-[#635BFF] dark:fill-[#8D86FF]"}>
      <path d={STRIPE_MARK_PATH} />
    </svg>
  );
}

/** A payment method's text with the Stripe mark before it when the method is a card. */
export function MethodName({ method, children }: { method: string; children: React.ReactNode }) {
  if (method !== "stripe") return <>{children}</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <StripeMark />
      {children}
    </span>
  );
}
