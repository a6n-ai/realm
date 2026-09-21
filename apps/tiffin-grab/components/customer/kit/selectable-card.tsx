import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Check } from "lucide-react";
import { cn, FONT, FOCUS, SPRING } from "./cn";

interface SelectableCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  selected: boolean;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  /** Show the round arrow/check affordance on the right (plan cards). */
  indicator?: boolean;
}

/** Wizard option card: 20px radius, 2px border, primary/10 wash when selected. */
export function SelectableCard({ selected, title, description, trailing, indicator, className, children, type = "button", ...rest }: SelectableCardProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-pressed={selected}
      className={cn(
        FONT,
        FOCUS,
        "flex min-h-24 w-full cursor-pointer items-center justify-between gap-4 rounded-[20px] border-2 p-4 text-left [touch-action:manipulation] transition-[transform,background-color,border-color] duration-100 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100",
        SPRING,
        selected ? "border-[var(--primary)] bg-[color-mix(in_oklch,var(--primary)_10%,transparent)]" : "border-[var(--border)] bg-[var(--card)]",
        className,
      )}
    >
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="c-h2 leading-tight">{title}</span>
        {description && <span className="text-sm text-[var(--muted-foreground)]">{description}</span>}
        {children}
      </span>
      {trailing}
      {indicator && (
        <span
          aria-hidden
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full border-2 text-base",
            selected ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground,#fff)]" : "border-[var(--border)]",
          )}
        >
          {selected ? <Check className="size-4" /> : "→"}
        </span>
      )}
    </button>
  );
}
