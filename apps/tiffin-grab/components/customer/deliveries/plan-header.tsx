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
export function PlanHeader({ name, sub, counts, renew, color }: {
  name?: string | null;
  sub: Subscription;
  counts: TiffinCounts;
  renew: number | null;
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
      </div>
      {/* A custom meal's name is its whole composition — too long for the title on a phone. */}
      <p className="mt-3 text-[22px] font-bold leading-tight tracking-[-0.02em]" data-testid="plan-title">{sub.mealSizeCustom ? "Custom meal" : sub.mealSizeName}</p>
      {sub.mealSizeCustom && (
        <p className="mt-1 text-[15px] leading-snug text-pretty text-[var(--muted-foreground,#6E6558)]" data-testid="plan-composition">{sub.mealSizeName}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <OrderStatusBadge status={sub.displayStatus} />
        <Pill>
          {dot && <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: dot }} />}
          {sub.tagLabel || sub.planName}
        </Pill>
        <Pill>{counts.remaining} of {counts.total} tiffins left</Pill>
        {renew != null && <Pill>renews in {renew} {renew === 1 ? "day" : "days"}</Pill>}
      </div>
    </header>
  );
}
