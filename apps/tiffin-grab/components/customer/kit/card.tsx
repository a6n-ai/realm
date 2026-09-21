import type { HTMLAttributes } from "react";
import { cn, FONT, FOCUS, SPRING } from "./cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  selected?: boolean;
}

export function Card({ interactive, selected, className, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      {...(interactive ? { role: rest.role ?? "button", tabIndex: rest.tabIndex ?? 0, "aria-pressed": selected } : {})}
      className={cn(
        FONT,
        "rounded-3xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]",
        interactive && cn(FOCUS, "cursor-pointer transition-transform duration-150 active:scale-[.985] motion-reduce:transition-none", SPRING),
        selected && "border-[var(--primary)] bg-[color-mix(in_oklch,var(--primary)_10%,transparent)]",
        className,
      )}
    />
  );
}
