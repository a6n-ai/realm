"use client";

import { useId } from "react";
import { Loader2 } from "lucide-react";
import type { AuthButtonProps, AuthFieldProps, AuthUi } from "@foundry/auth-ui";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { IOS_BUTTON } from "@/components/customer/ios-button";

// TiffinGrab's skin for the shared @foundry/auth-ui screens: the same iOS-sized
// controls (50px targets, 14px corners, 17px type) the customer app uses.
export const IOS_INPUT = "!h-[50px] !rounded-[14px] !px-4 !text-[17px] tracking-[-0.011em]";

const VARIANT = { primary: "default", outline: "outline", quiet: "ghost", danger: "destructive" } as const;

function KitButton({ variant = "primary", pending, pendingLabel, disabled, type = "button", className, onClick, children }: AuthButtonProps) {
  return (
    <Button type={type} variant={VARIANT[variant]} disabled={disabled || pending} onClick={onClick} className={`${IOS_BUTTON} gap-2 ${className ?? ""}`}>
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
