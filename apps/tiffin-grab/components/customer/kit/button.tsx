"use client";

import { Loader2 } from "lucide-react";
import { useId, useState, type ButtonHTMLAttributes } from "react";
import { buttonClass, type ButtonVariant } from "./button-class";
import { cn, FONT } from "./cn";

export type { ButtonVariant };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "lg";
  /** Full-radius pill (checkout secondary actions); hero is always a pill. */
  pill?: boolean;
  pending?: boolean;
  /** Renders aria-disabled (still focusable) and shows this text when tapped. */
  disabledReason?: string;
}

export function Button({
  variant = "outline",
  size = "md",
  pill,
  pending,
  disabledReason,
  className,
  onClick,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const [showReason, setShowReason] = useState(false);
  const reasonId = useId();
  const blocked = Boolean(disabledReason) || Boolean(pending) || Boolean(rest.disabled);
  const { disabled: _d, ...props } = rest;
  return (
    <>
      <button
        {...props}
        type={type}
        aria-disabled={blocked || undefined}
        aria-busy={pending || undefined}
        aria-describedby={disabledReason ? reasonId : props["aria-describedby"]}
        onClick={(e) => {
          if (blocked) {
            e.preventDefault();
            if (disabledReason) setShowReason(true);
            return;
          }
          onClick?.(e);
        }}
        className={buttonClass({ variant, size, pill, blocked, className })}
      >
        {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
        {children}
      </button>
      {disabledReason && (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      )}
      {disabledReason && showReason && (
        <p role="status" className={cn(FONT, "mt-2 text-[13px] text-[var(--muted-foreground,#6E6558)]")}>
          {disabledReason}
        </p>
      )}
    </>
  );
}
