"use client";

import { useId } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { AuthButtonProps, AuthFieldProps, AuthUi } from "@foundry/auth-ui";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import Image from "next/image";
import { SITE_NAME } from "@/lib/brand";

// Xplorers's skin for the shared @foundry/auth-ui screens: theme colors come
// from the app's own tokens; this only sets phone-sized controls (48px).
export const AUTH_BUTTON = "h-12 w-full rounded-xl text-base font-semibold";
export const AUTH_INPUT = "h-12 rounded-xl px-4 text-base";

const VARIANT = { primary: "default", outline: "outline", quiet: "ghost", danger: "destructive" } as const;

function KitButton({ variant = "primary", pending, pendingLabel, disabled, type = "button", className, onClick, children }: AuthButtonProps) {
  return (
    <Button type={type} variant={VARIANT[variant]} disabled={disabled || pending} onClick={onClick} className={`${AUTH_BUTTON} gap-2 ${className ?? ""}`}>
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
      className={`${AUTH_INPUT} ${trailing ? "pr-12" : ""} ${className ?? ""}`}
      {...input}
    />
  );
  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>{label}</Label>
      {trailing ? <div className="relative">{control}{trailing}</div> : control}
      {error ? <p id={`${fieldId}-error`} className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}

export const appAuthUi: Partial<AuthUi> = { Button: KitButton, Field: KitField };

/** The logo, shown once per auth screen at the top of its AuthPanel. */
export function AuthLogo() {
  return (
    // The logo is drawn for light grounds only, so it sits on its blush tile in both themes.
    <Link href="/" aria-label={`${SITE_NAME} home`} className="bg-brand-blush block rounded-xl px-3 py-2">
      <Image src="/brand/logo-xplorers.png" alt={SITE_NAME} width={555} height={245} className="h-10 w-auto mix-blend-multiply" />
    </Link>
  );
}
