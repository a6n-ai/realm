"use client";
import { ChevronDown, Info } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { Choice, ChoiceGroup } from "@/components/customer/kit";

const muted = "text-[var(--muted-foreground,#6E6558)]";

/** One button in a row: a dish, a swap, or what the row was before a swap. */
export type RowChoice = {
  value: string;
  label: string;
  /** Greyed out: shown, but not a choice the customer can make right now. */
  disabled?: boolean;
  /** Why it's greyed out — behind a red ⓘ, so every button stays the same size. */
  reason?: string;
  /** An exchange into another category: listed after the dishes, under "Or exchange for". */
  swap?: boolean;
};

/**
 * One composition row of Edit meal — a label and its grid of equal choice buttons.
 * Every category and every row state (plain, fixed, swapped, the dish picker a swap
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
  /** Under the buttons: nested pickers. */
  children?: ReactNode;
}) {
  const [why, setWhy] = useState<string | null>(null);
  const shown = choices.find((c) => c.value === why && c.reason);
  return (
    <div className={nested ? "ml-3 grid gap-2 border-l-2 border-[var(--border,#E8E0D5)] pl-3" : "grid gap-2"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={nested ? `text-[13px] font-semibold ${muted}` : "text-[15px] font-semibold"}>{label}</p>
        {hint && <p className={`text-[13px] ${muted}`}>{hint}</p>}
      </div>
      <ChoiceGroup label={label} value={value} onChange={onChange} className="grid gap-2 sm:grid-cols-2">
        {[...choices.filter((c) => !c.swap), ...choices.filter((c) => c.swap)].map((c, i, all) => (
          <Fragment key={c.value}>
          {c.swap && !all[i - 1]?.swap && <p className={`col-span-full mt-1 text-[12px] font-semibold uppercase tracking-wide ${muted}`}>Or exchange for</p>}
          <div key={c.value} className="relative">
            <Choice value={c.value} disabled={c.disabled} className="min-h-12 w-full px-3.5 py-3 text-[15px] font-semibold">
              <span className="min-w-0 flex-1 text-left leading-snug">{c.label}</span>
              {c.reason && <span aria-hidden className="size-5 shrink-0" />}
            </Choice>
            {c.reason && (
              // Outside the (disabled, faded) button so it stays red and tappable.
              <button
                type="button"
                aria-label={`Why ${c.label} is unavailable`}
                aria-expanded={why === c.value}
                onClick={() => setWhy((w) => (w === c.value ? null : c.value))}
                className="text-destructive absolute top-1/2 right-9 grid size-7 -translate-y-1/2 place-items-center rounded-full"
              >
                <Info aria-hidden className="size-4" />
              </button>
            )}
          </div>
          </Fragment>
        ))}
      </ChoiceGroup>
      {shown && (
        <p role="status" className="text-destructive text-[13px] font-medium text-pretty">
          {shown.label}: {shown.reason}
        </p>
      )}
      {children}
    </div>
  );
}

/**
 * A category's heading with its rows under it. With `onToggle` it is an accordion row: closed it
 * shows the current dishes and a status, open it shows the rows. The sheet keeps one open at a time.
 */
export function CategorySection({ label, children, summary, status, open, onToggle }: {
  label: string;
  children: ReactNode;
  /** Closed: what the category holds now ("Chicken Curry · 12oz, Dal Tadka · 8oz"). */
  summary?: string;
  /** Default / Changed / Swapped / Locked. */
  status?: string;
  open?: boolean;
  onToggle?: () => void;
}) {
  if (!onToggle) {
    return (
      <section aria-label={label} className="grid gap-4">
        <h4 className={`text-[13px] font-semibold uppercase tracking-wide ${muted}`}>{label}</h4>
        <div className="grid gap-5">{children}</div>
      </section>
    );
  }
  return (
    <section aria-label={label} className="rounded-2xl border border-[var(--border,#E8E0D5)] bg-[var(--card,#fff)]">
      <button type="button" aria-expanded={!!open} onClick={onToggle} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left [touch-action:manipulation]">
        <span className="min-w-0 flex-1">
          <span className={`block text-[12px] font-semibold uppercase tracking-wide ${muted}`}>{label}</span>
          {summary && <span className="block truncate text-[15px] font-semibold">{summary}</span>}
        </span>
        {status && <span className={`shrink-0 text-[12px] ${muted}`}>{status}</span>}
        <ChevronDown aria-hidden className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""} ${muted}`} />
      </button>
      {open && <div className="grid gap-5 border-t border-[var(--border,#E8E0D5)] p-4">{children}</div>}
    </section>
  );
}
