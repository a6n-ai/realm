"use client";

import { Minus, Plus } from "lucide-react";
import { useId, type InputHTMLAttributes } from "react";
import { cn, FONT, FOCUS, SPRING } from "./cn";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, className, id, ...rest }: FieldProps) {
  const uid = useId();
  const inputId = id ?? uid;
  const hintId = `${inputId}-hint`;
  const errId = `${inputId}-err`;
  const describedBy = [hint && hintId, error && errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn(FONT, "flex flex-col gap-1.5")}>
      <label htmlFor={inputId} className="text-sm font-semibold">
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          FOCUS,
          "min-h-12 rounded-2xl border-[1.5px] bg-[var(--card)] px-4 text-base text-[var(--foreground)]",
          error ? "border-[#be123c]" : "border-[var(--border)]",
          className,
        )}
      />
      {hint && (
        <p id={hintId} className="text-[13px] text-[var(--muted-foreground,#6E6558)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-[13px] font-medium text-[#be123c] dark:text-[#fda4af]">
          {error}
        </p>
      )}
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ label, checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        FOCUS,
        "relative h-8 w-[52px] shrink-0 rounded-2xl transition-colors duration-[250ms] motion-reduce:transition-none [touch-action:manipulation]",
        checked ? "bg-[var(--primary)]" : "bg-[var(--border)]",
        disabled && "opacity-45",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-[3px] top-[3px] size-[26px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)] transition-transform duration-[250ms] motion-reduce:transition-none",
          SPRING,
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

interface StepperProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}

export function Stepper({ label, value, onChange, min = 0, max = Infinity }: StepperProps) {
  const step = (d: number) => {
    const next = Math.min(max, Math.max(min, value + d));
    if (next !== value) onChange(next);
  };
  const btn = cn(FOCUS, "grid size-11 place-items-center rounded-full aria-disabled:opacity-35 active:bg-[var(--muted)]");
  return (
    <div className={cn(FONT, "inline-flex items-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--card)]")}>
      <button type="button" className={btn} aria-label={`Decrease ${label}`} aria-disabled={value <= min || undefined} onClick={() => step(-1)}>
        <Minus aria-hidden className="size-4" />
      </button>
      <span aria-live="polite" className="min-w-7 text-center font-semibold tabular-nums">
        {value}
      </span>
      <button type="button" className={btn} aria-label={`Increase ${label}`} aria-disabled={value >= max || undefined} onClick={() => step(1)}>
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  );
}
