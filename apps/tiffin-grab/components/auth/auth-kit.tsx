"use client";

import { useId } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { AuthButtonProps, AuthFieldProps, AuthUi } from "@foundry/auth-ui";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { IOS_BUTTON } from "@/components/customer/ios-button";
import { BrandMark, BrandWordmark } from "@/components/brand-logo";

// TiffinGrab's skin for the shared @foundry/auth-ui screens: the same iOS-sized
// controls (50px targets, 14px corners, 17px type) the customer app uses.
export const IOS_INPUT = "!h-[50px] !rounded-[14px] !px-4 !text-[17px] tracking-[-0.011em]";
// @foundry/ui PhoneInput is a country button + input at h-8; same lift as IOS_INPUT, on a wrapper.
export const IOS_PHONE = "[&_input]:!h-[50px] [&_input]:!text-[17px] [&_input]:!rounded-e-[14px] [&_button]:!h-[50px] [&_button]:!rounded-s-[14px]";

const VARIANT = { primary: "default", outline: "outline", quiet: "ghost", danger: "destructive" } as const;
// The shadcn primary fades to 80% on hover, which reads as disabled; darken it and lift
// 1px instead, the same answer the customer kit's primary gives.
const HOVER: Partial<Record<keyof typeof VARIANT, string>> = {
  primary: "transition-[background-color,translate] hover:!bg-[color-mix(in_oklch,var(--primary)_86%,black)] [@media(hover:hover)]:hover:-translate-y-px",
  outline: "transition-[background-color,border-color] hover:!border-[var(--primary)]",
};

function KitButton({ variant = "primary", pending, pendingLabel, disabled, type = "button", className, onClick, children }: AuthButtonProps) {
  return (
    <Button type={type} variant={VARIANT[variant]} disabled={disabled || pending} onClick={onClick} className={`${IOS_BUTTON} gap-2 ${HOVER[variant] ?? ""} ${className ?? ""}`}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

function KitField({ label, error, trailing, id, ref, className, ...input }: AuthFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const control = (
    <Input
      id={fieldId}
      ref={ref}
      aria-invalid={!!error}
      aria-describedby={error ? `${fieldId}-error` : undefined}
      className={`${IOS_INPUT} ${trailing ? "pr-12" : ""} ${className ?? ""}`}
      {...input}
    />
  );
  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId} className="text-[15px]">{label}</Label>
      {trailing ? <div className="relative">{control}{trailing}</div> : control}
      {error ? <p id={`${fieldId}-error`} className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}

export const tiffinAuthUi: Partial<AuthUi> = { Button: KitButton, Field: KitField };

/** The live logo, shown once per auth screen at the top of its AuthPanel. */
export function AuthLogo() {
  return (
    <Link href="/" aria-label="TiffinGrab home" className="flex items-center gap-2.5">
      <BrandMark className="size-12" />
      <BrandWordmark className="text-[26px]" />
    </Link>
  );
}

export function AuthLegal() {
  return (
    <>
      By continuing, you agree to our <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.
    </>
  );
}
