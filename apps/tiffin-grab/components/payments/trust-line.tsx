"use client";

import { CreditCard, Lock, Wallet } from "lucide-react";

export function TrustLine() {
  return (
    <p className="flex items-center justify-center gap-2 text-xs text-[var(--muted-foreground,#6E6558)]">
      <Lock aria-hidden className="size-3.5" />
      <span>Secured by Stripe</span>
      <CreditCard aria-hidden className="size-3.5" />
      <Wallet aria-hidden className="size-3.5" />
    </p>
  );
}
