"use client";

import { ChevronDown } from "lucide-react";
import { useId, type SelectHTMLAttributes } from "react";
import { cn, FONT, FOCUS } from "./cn";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  placeholder?: string;
  options: readonly { value: string; label: string }[];
}

export function Select({ label, hint, error, placeholder, options, className, id, ...rest }: SelectProps) {
  const uid = useId();
  const selectId = id ?? uid;
  const describedBy = [hint && `${selectId}-hint`, error && `${selectId}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn(FONT, "flex flex-col gap-1.5")}>
      <label htmlFor={selectId} className="text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <select
          {...rest}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            FOCUS,
            "min-h-[52px] w-full appearance-none rounded-2xl border border-transparent bg-foreground/7 pl-4 pr-11 text-base text-foreground disabled:opacity-50",
            !rest.value && placeholder && "text-[var(--muted-foreground)]",
            error ? "border-[#be123c]" : "border-border",
            className,
          )}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
      </div>
      {hint && (
        <p id={`${selectId}-hint`} className="text-footnote text-[var(--muted-foreground)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${selectId}-err`} role="alert" className="text-footnote font-medium text-[#be123c] dark:text-[#fda4af]">
          {error}
        </p>
      )}
    </div>
  );
}
