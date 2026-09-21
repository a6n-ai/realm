"use client";
import type { Subscription, SubscriptionWindow, TiffinCounts } from "@/lib/services/customer-deliveries.service";

const HEX = /^#[0-9a-fA-F]{6}$/;
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Running · to Sep 25" / "Starts Oct 26" / "Finished": tells same-sized plans apart. */
export function windowLabel(w: SubscriptionWindow | undefined, today: string): string | null {
  if (!w) return null;
  if (w.next == null) return "Finished";
  return w.first > today ? `Starts ${shortDate(w.first)}` : `Running · to ${shortDate(w.last)}`;
}

/** One quiet line about the plan that owns the selected trip; the plan chips live in the view. */
export function PlanHeader({ sub, counts, renew, onVacation, onVacationClick, color }: {
  sub: Subscription;
  counts: TiffinCounts;
  renew: number | null;
  onVacation: boolean;
  onVacationClick: () => void;
  color?: string;
}) {
  const dot = color ?? (sub.tagColor && HEX.test(sub.tagColor) ? sub.tagColor : null);
  return (
    <header className="mb-4 lg:mb-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-[clamp(28px,5vw,40px)] font-bold leading-[1.1] tracking-[-0.03em]">
          Your <em className="text-[var(--primary)]">trips.</em>
        </h1>
        <button
          type="button"
          onClick={onVacationClick}
          className="-mr-2 inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-semibold text-[var(--muted-foreground,#6E6558)] underline underline-offset-4 [touch-action:manipulation] lg:hidden"
        >
          {onVacation ? "On vacation · Resume" : "Vacation"}
        </button>
      </div>
      <p className="mt-2 text-[15px] text-[var(--muted-foreground,#6E6558)]">
        <span className="font-semibold text-[var(--foreground)]">{sub.mealSizeName}</span>
        {" · "}
        {dot && <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: dot }} />}
        <span>{sub.tagLabel || sub.planName}</span>
        {" · "}
        <span className="tabular-nums">
          {counts.remaining} of {counts.total} tiffins left
          {counts.holdDays > 0 && <> · {counts.holdDays} hold {counts.holdDays === 1 ? "day" : "days"}</>}
        </span>
        {renew != null && <span className="tabular-nums"> · renews in {renew} {renew === 1 ? "day" : "days"}</span>}
        {onVacation && " · On vacation"}
      </p>
    </header>
  );
}
