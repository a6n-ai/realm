import { formatDateOnly } from "@/lib/format/datetime";

const DAY: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface PlanSummaryProps {
  baseline?: string | null;
  mealName?: string | null;
  deliveryName?: string | null;
  eatingDays: string[];
  weeks: number;
  startDate?: string;
  /** From the server PricingResult; display only. */
  tiffinCount: number;
}

/** "What you're getting" card shown above the price breakdown. */
export function PlanSummary({ baseline, mealName, deliveryName, eatingDays, weeks, startDate, tiffinCount }: PlanSummaryProps) {
  const perWeek = eatingDays.length;
  return (
    <section aria-label="What you're getting" className="bg-card border-border mb-3 rounded-[20px] border p-4 text-sm">
      <h3 className="text-muted-foreground mb-2 text-[13px] font-semibold tracking-[0.02em]">What you&apos;re getting</h3>
      <p className="text-[17px] leading-snug font-semibold tracking-[-0.02em]">{mealName ?? "Your meal"}</p>
      {baseline ? <p className="text-muted-foreground">{baseline}</p> : null}
      {deliveryName ? (
        <div className="mt-3">
          <p className="text-muted-foreground text-xs">Delivery · {deliveryName}</p>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1" aria-label="Eating days">
        {eatingDays.map((d) => (
          <span key={d} className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold">{DAY[d] ?? d}</span>
        ))}
      </div>
      <p className="mt-3 font-medium tabular-nums">
        {plural(perWeek, "tiffin", "tiffins")} a week × {plural(weeks, "week", "weeks")} = {plural(tiffinCount, "tiffin", "tiffins")}
      </p>
      {startDate ? <p className="text-muted-foreground mt-0.5">Starts {formatDateOnly(startDate, { mode: "short" })}</p> : null}
    </section>
  );
}
