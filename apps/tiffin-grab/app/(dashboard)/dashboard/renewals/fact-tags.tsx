import { LifeBuoyIcon, PauseCircleIcon, RefreshCwIcon, type LucideIcon } from "lucide-react";

// No "use client": the server page renders the legend and the client list renders the tags,
// both from this one map so the legend can't drift from the rows (same pattern as Orders' row tags).
export const RENEWAL_FACTS = {
  priorPlans: { icon: RefreshCwIcon, label: "Renewed before", className: "text-emerald-600 dark:text-emerald-400" },
  holds: { icon: PauseCircleIcon, label: "Days held or paused", className: "text-amber-600 dark:text-amber-400" },
  openTickets: { icon: LifeBuoyIcon, label: "Open tickets", className: "text-sky-600 dark:text-sky-400" },
} satisfies Record<string, { icon: LucideIcon; label: string; className: string }>;

export type RenewalFact = keyof typeof RENEWAL_FACTS;

/** One colored icon + count after the name; hover says what it counts. Nothing when the count is 0. */
export function FactTag({ fact, n, title }: { fact: RenewalFact; n: number; title: string }) {
  if (n <= 0) return null;
  const { icon: Icon, label, className } = RENEWAL_FACTS[fact];
  return (
    <span title={title} className={`ml-2 inline-flex items-center gap-0.5 align-middle text-xs font-medium tabular-nums ${className}`}>
      <Icon className="size-4" aria-label={label} />
      {n}
    </span>
  );
}

export function RenewalFactsLegend() {
  return (
    <ul className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label="Icon legend">
      {Object.values(RENEWAL_FACTS).map(({ icon: Icon, label, className }) => (
        <li key={label} className="inline-flex items-center gap-1.5">
          <Icon className={`size-4 ${className}`} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}
