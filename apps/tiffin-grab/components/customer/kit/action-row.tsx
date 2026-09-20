"use client";

import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn, FONT, FOCUS } from "./cn";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  sublabel?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  /** Replaces the sublabel, always visible (touch parity, no tooltip). */
  disabledReason?: string;
}

export function ActionRow({ label, sublabel, icon, trailing, disabledReason, onClick, className, type = "button", ...rest }: Props) {
  const subId = useId();
  const sub = disabledReason ?? sublabel;
  return (
    <button
      {...rest}
      type={type}
      aria-disabled={disabledReason ? true : undefined}
      aria-describedby={sub ? subId : undefined}
      onClick={(e) => (disabledReason ? e.preventDefault() : onClick?.(e))}
      className={cn(
        FONT,
        FOCUS,
        "flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left [touch-action:manipulation] active:bg-[var(--muted)]",
        disabledReason && "opacity-60",
        className,
      )}
    >
      {icon && <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--muted)]">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{label}</span>
        {sub && (
          <span id={subId} className="block text-[13px] text-[var(--muted-foreground,#6E6558)]">
            {sub}
          </span>
        )}
      </span>
      {trailing}
    </button>
  );
}
