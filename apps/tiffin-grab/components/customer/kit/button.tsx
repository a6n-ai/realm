"use client";

import { Loader2 } from "lucide-react";
import { useId, useState, type ButtonHTMLAttributes } from "react";
import { cn, FOCUS, FONT, SPRING } from "./cn";

export type ButtonVariant = "primary" | "outline" | "quiet" | "ghost" | "danger" | "hero";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground,#fff)] hover:bg-[var(--primary-hover,var(--primary))]",
  hero:
    "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground,#fff)] shadow-[0_12px_30px_-8px_color-mix(in_oklch,var(--primary)_70%,transparent)] hover:bg-[var(--primary-hover,var(--primary))]",
  outline: "border-[var(--foreground)] bg-transparent text-[var(--foreground)] hover:bg-[var(--muted)]",
  quiet: "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]",
  ghost: "border-transparent bg-transparent text-[var(--foreground)] hover:bg-[var(--muted)]",
  danger: "border-[#be123c] bg-transparent text-[#be123c] hover:bg-[#be123c1a] dark:border-[#fda4af] dark:text-[#fda4af] dark:hover:bg-[#fda4af1a]",
};

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
        className={cn(
          FONT,
          FOCUS,
          "inline-flex select-none items-center justify-center gap-2 border-[1.5px] font-semibold [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] transition-[transform,background-color,opacity] duration-150 active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100",
          SPRING,
          variant === "hero" || pill ? "rounded-full" : "rounded-[14px]",
          variant === "hero" && "px-[22px] text-[15px]",
          size === "lg"
            ? cn("min-h-[50px] px-4 text-[17px] tracking-[-0.022em]", variant === "hero" && "min-h-[52px] px-[22px] text-[15px] tracking-normal")
            : cn("min-h-[44px] px-4 text-[15px]", variant === "hero" && "px-[22px]"),
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
