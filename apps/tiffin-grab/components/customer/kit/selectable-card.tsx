"use client";

import { createContext, useContext, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn, FONT, FOCUS, SPRING } from "./cn";

interface OptionCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected: boolean;
}

/**
 * Bare wizard option shell: 20px radius, 2px border, primary/10 wash when selected, press scale.
 * Callers own the inner layout (SelectableCard is the titled row; bundle and delivery cards are stacks).
 * role="radio" swaps aria-pressed for aria-checked so it can sit in a ChoiceGroup.
 */
export function OptionCard({ selected, className, children, type = "button", role, ...rest }: OptionCardProps) {
  return (
    <button
      {...rest}
      type={type}
      role={role}
      {...(role === "radio" ? { "aria-checked": selected } : { "aria-pressed": selected })}
      className={cn(
        FONT,
        FOCUS,
        "cursor-pointer rounded-[20px] border-2 text-left [touch-action:manipulation] transition-[transform,background-color,border-color] duration-100 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100",
        SPRING,
        selected
          ? "border-[var(--primary)] bg-[color-mix(in_oklch,var(--primary)_10%,transparent)]"
          : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--muted-foreground,#6E6558)] hover:bg-[var(--muted)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

interface SelectableCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  selected: boolean;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  /** Show the round arrow/check affordance on the right (plan cards). */
  indicator?: boolean;
}

/** Wizard option card: 20px radius, 2px border, primary/10 wash when selected. */
export function SelectableCard({ selected, title, description, trailing, indicator, className, children, ...rest }: SelectableCardProps) {
  return (
    <OptionCard {...rest} selected={selected} className={cn("flex min-h-24 w-full items-center justify-between gap-4 p-4", className)}>
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
    </OptionCard>
  );
}

/** Round toggle pill for a row of days: 48px, primary fill when on. */
export function PillToggle({ on, className, children, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }) {
  return (
    <button
      {...rest}
      type={type}
      aria-pressed={on}
      className={cn(
        FONT,
        FOCUS,
        "flex h-12 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-full border px-0 text-[14px] font-semibold [touch-action:manipulation] transition-[transform,background-color,border-color] duration-100 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100 sm:px-3 sm:text-[15px]",
        SPRING,
        on ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground,#fff)]" : "border-[var(--border)] bg-[var(--card)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

const ChoiceCtx = createContext<{ value: string; onChange: (v: string) => void } | null>(null);

/** Radio group of option cards: role=radiogroup, roving tabindex, arrows move and select. */
export function ChoiceGroup({ label, value, onChange, className, children }: { label: string; value: string; onChange: (v: string) => void; className?: string; children: ReactNode }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    const next = items[(at + step + items.length) % items.length];
    next.focus();
    next.click();
  };
  return (
    <ChoiceCtx.Provider value={{ value, onChange }}>
      <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={className}>
        {children}
      </div>
    </ChoiceCtx.Provider>
  );
}

export function Choice({ value, className, children, ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> & { value: string }) {
  const ctx = useContext(ChoiceCtx);
  if (!ctx) throw new Error("Choice must sit inside ChoiceGroup");
  const on = ctx.value === value;
  return (
    <OptionCard {...rest} role="radio" selected={on} tabIndex={on ? 0 : -1} onClick={() => ctx.onChange(value)} className={cn("flex items-center justify-between gap-2", className)}>
      {children}
      <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded-full border", on ? "border-[var(--primary)]" : "border-[var(--border)]")}>
        {on && <span className="size-2 rounded-full bg-[var(--primary)]" />}
      </span>
    </OptionCard>
  );
}
