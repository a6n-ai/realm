"use client";
import { Palmtree } from "lucide-react";
import Link from "next/link";
import { Button, Pill } from "@/components/customer/kit";
import type { Subscription, TiffinCounts } from "@/lib/services/customer-deliveries.service";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Diet pill keeps the admin tagColor (PlanBox data rule), tinted like the kit pills. */
function DietPill({ label, color }: { label: string; color?: string | null }) {
  const c = color && HEX.test(color) ? color : null;
  return (
    <Pill tone="neutral" style={c ? { backgroundColor: `${c}24`, color: `color-mix(in oklab, ${c} 75%, var(--foreground))` } : undefined}>
      {label}
    </Pill>
  );
}

export function PlanHeader({
  sub, subs, counts, renew, cutoffHour, onVacation, onVacationClick, subHref,
}: {
  sub: Subscription;
  subs: Subscription[];
  counts: TiffinCounts;
  renew: number | null;
  cutoffHour: number;
  onVacation: boolean;
  onVacationClick: () => void;
  subHref: (publicId: string) => string;
}) {
  const left = counts.remaining;
  const hour = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(2000, 0, 1, cutoffHour));
  return (
    <header className="mb-6 lg:mb-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--primary)]">Deliveries</p>
          <h1 className="mt-1 text-[clamp(28px,5vw,40px)] font-bold leading-[1.1] tracking-[-0.03em]">
            Your <em className="text-[var(--primary)]">trips.</em>
          </h1>
        </div>
        <Button variant="quiet" className="shrink-0 lg:hidden" onClick={onVacationClick}>
          <Palmtree aria-hidden className="size-4" />
          {onVacation ? "Resume" : "Vacation"}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Pill tone="brand">{sub.mealSizeName}</Pill>
        <DietPill label={sub.tagLabel || sub.planName} color={sub.tagColor} />
        <Pill tone={onVacation ? "vac" : "ok"}>{onVacation ? "On vacation" : "Active"}</Pill>
        <Pill className="tabular-nums">
          {left} of {counts.total} tiffins left
          {counts.holdDays > 0 && <> · {counts.holdDays} hold {counts.holdDays === 1 ? "day" : "days"}</>}
        </Pill>
        {renew != null && <Pill className="tabular-nums">Renews in {renew} {renew === 1 ? "day" : "days"}</Pill>}
        <span className="ml-auto hidden text-sm text-[var(--muted-foreground,#6E6558)] lg:inline">Cutoff is {hour} the day before each delivery</span>
      </div>
      {subs.length > 1 && (
        <nav aria-label="Subscriptions" className="mt-3 flex flex-wrap gap-2">
          {subs.map((s) => (
            <Link
              key={s.publicId}
              href={subHref(s.publicId)}
              aria-current={s.publicId === sub.publicId ? "true" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4 text-sm font-semibold ${s.publicId === sub.publicId ? "border-[var(--primary)] bg-[var(--primary-wash,#FBE3D2)]" : "border-[var(--border)]"}`}
            >
              {s.mealSizeName}{s.status === "paused" ? " (paused)" : ""}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
