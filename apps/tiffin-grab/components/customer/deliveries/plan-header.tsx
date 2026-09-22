"use client";
import type { Subscription, SubscriptionWindow, TiffinCounts } from "@/lib/services/customer-deliveries.service";
import { OrderStatusBadge } from "@/components/ds";

const HEX = /^#[0-9a-fA-F]{6}$/;
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Running · to Sep 25" / "Starts Oct 26" / "Finished": tells same-sized plans apart. */
export function windowLabel(w: SubscriptionWindow | undefined, today: string): string | null {
  if (!w) return null;
  if (w.next == null) return "Finished";
  return w.first > today ? `Starts ${shortDate(w.first)}` : `Running · to ${shortDate(w.last)}`;
}

const Pill = ({ children, tone }: { children: React.ReactNode; tone?: "warn" }) => (
  <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium tabular-nums ${tone === "warn" ? "bg-[var(--s-vac,#d98a00)]/15 text-[var(--foreground)]" : "bg-[var(--muted)] text-[var(--muted-foreground,#6E6558)]"}`}>{children}</span>
);

/** Greets the customer by name; the plan gets a bold size title with diet, tiffins left and renew as small pills. */
export function PlanHeader({ name, sub, counts, renew, onVacation, onVacationClick, color }: {
  name?: string | null;
  sub: Subscription;
  counts: TiffinCounts;
  renew: number | null;
  onVacation: boolean;
  onVacationClick: () => void;
  color?: string;
}) {
  const dot = color ?? (sub.tagColor && HEX.test(sub.tagColor) ? sub.tagColor : null);
  const first = name?.trim().split(/\s+/)[0];
  return (
    <header className="mb-4 lg:mb-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-[clamp(28px,5vw,40px)] font-bold leading-[1.1] tracking-[-0.03em]">
          {first ? <>Hi, <em className="text-[var(--primary)]">{first}.</em></> : <>Your <em className="text-[var(--primary)]">trips.</em></>}
        </h1>
        <button
          type="button"
          onClick={onVacationClick}
          className="-mr-2 inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-semibold text-[var(--muted-foreground,#6E6558)] underline underline-offset-4 [touch-action:manipulation] lg:hidden"
        >
          {onVacation ? "On vacation · Resume" : "Vacation"}
        </button>
      </div>
      <p className="mt-3 text-[22px] font-bold leading-tight tracking-[-0.02em]" data-testid="plan-title">{sub.mealSizeName}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <OrderStatusBadge status={sub.displayStatus} />
        <Pill>
          {dot && <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: dot }} />}
          {sub.tagLabel || sub.planName}
        </Pill>
        <Pill>{counts.remaining} of {counts.total} tiffins left</Pill>
        {counts.holdDays > 0 && <Pill>{counts.holdDays} hold {counts.holdDays === 1 ? "day" : "days"}</Pill>}
        {renew != null && <Pill>renews in {renew} {renew === 1 ? "day" : "days"}</Pill>}
        {onVacation && <Pill tone="warn">On vacation</Pill>}
      </div>
    </header>
  );
}
