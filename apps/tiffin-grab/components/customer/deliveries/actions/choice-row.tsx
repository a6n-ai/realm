"use client";
import type { ReactNode } from "react";
import { Choice, ChoiceGroup } from "@/components/customer/kit";

const muted = "text-[var(--muted-foreground,#6E6558)]";

/** One button in a row: a dish, a swap, or what the row was before a swap. */
export type RowChoice = {
  value: string;
  label: string;
  /** Second line: "Choose this instead", the dish a swap brings, or why it's greyed out. */
  note?: string;
  /** Greyed out: shown, but not a choice the customer can make right now. */
  disabled?: boolean;
};

/**
 * One composition row of Edit meal — a label and its grid of choice buttons. Every
 * category and every row state (plain, fixed, swapped, the dish picker a swap
 * brings) renders through this, so they all look and behave the same.
 */
export function ChoiceRow({
  label,
  hint,
  choices,
  value,
  onChange,
  nested = false,
  children,
}: {
  label: string;
  /** Right of the label: "Default pick", "Included". */
  hint?: string;
  choices: RowChoice[];
  value: string;
  onChange: (value: string) => void;
  /** Indented under the row it belongs to (the dish picker inside a swapped row). */
  nested?: boolean;
  /** Under the buttons: Undo swap, nested pickers. */
  children?: ReactNode;
}) {
  return (
    <div className={nested ? "ml-3 grid gap-2 border-l-2 border-[var(--border,#E8E0D5)] pl-3" : "grid gap-2"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={nested ? `text-[13px] font-semibold ${muted}` : "text-[15px] font-semibold"}>{label}</p>
        {hint && <p className={`text-[13px] ${muted}`}>{hint}</p>}
      </div>
      <ChoiceGroup label={label} value={value} onChange={onChange} className="grid gap-2 sm:grid-cols-2">
        {choices.map((c) => (
          <Choice key={c.value} value={c.value} disabled={c.disabled} className="min-h-12 w-full px-3.5 py-3 text-[15px] font-semibold">
            <span className="min-w-0 flex-1 text-left">
              <span className="block leading-snug">{c.label}</span>
              {c.note && <span className={`mt-0.5 block text-[13px] font-normal ${muted}`}>{c.note}</span>}
            </span>
          </Choice>
        ))}
      </ChoiceGroup>
      {children}
    </div>
  );
}

/** A category's heading with its rows under it. */
export function CategorySection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="grid gap-4">
      <h4 className={`text-[13px] font-semibold uppercase tracking-wide ${muted}`}>{label}</h4>
      <div className="grid gap-5">{children}</div>
    </section>
  );
}
