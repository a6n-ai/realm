"use client";

import { Loader2 } from "lucide-react";
import { useId, useState, type ButtonHTMLAttributes } from "react";
import { cn, FOCUS, FONT, SPRING } from "./cn";

export type ButtonVariant = "primary" | "outline" | "quiet" | "danger";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground,#fff)] shadow-[0_12px_30px_-8px_color-mix(in_oklch,var(--primary)_70%,transparent)] hover:bg-[var(--primary-hover,var(--primary))]",
  outline: "border-[var(--foreground)] bg-transparent text-[var(--foreground)]",
  quiet: "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]",
  danger: "border-[#be123c] bg-transparent text-[#be123c] dark:border-[#fda4af] dark:text-[#fda4af]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "lg";
  pending?: boolean;
  /** Renders aria-disabled (still focusable) and shows this text when tapped. */
  disabledReason?: string;
}

export function Button({
  variant = "outline",
  size = "md",
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
        className={cn(
          FONT,
          FOCUS,
          "inline-flex select-none items-center justify-center gap-2 rounded-full border-[1.5px] px-[22px] text-[15px] font-semibold [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] transition-[transform,background-color,opacity] duration-150 active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100",
          SPRING,
          size === "lg" ? "min-h-[52px]" : "min-h-[44px]",
          VARIANT[variant],
          blocked && "opacity-45 shadow-none",
          className,
        )}
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
