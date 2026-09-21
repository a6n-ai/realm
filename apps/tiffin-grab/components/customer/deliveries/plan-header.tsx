"use client";
import Link from "next/link";
import type { Subscription, TiffinCounts } from "@/lib/services/customer-deliveries.service";

const HEX = /^#[0-9a-fA-F]{6}$/;

export function PlanHeader({
  sub, subs, counts, renew, onVacation, onVacationClick, subHref,
}: {
  sub: Subscription;
  subs: Subscription[];
  counts: TiffinCounts;
  renew: number | null;
  onVacation: boolean;
  onVacationClick: () => void;
  subHref: (publicId: string) => string;
}) {
  const color = sub.tagColor && HEX.test(sub.tagColor) ? sub.tagColor : null;
  return (
    <header className="mb-5 lg:mb-8">
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
        {color && <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: color }} />}
        <span>{sub.tagLabel || sub.planName}</span>
        {" · "}
        <span className="tabular-nums">
          {counts.remaining} of {counts.total} tiffins left
          {counts.holdDays > 0 && <> · {counts.holdDays} hold {counts.holdDays === 1 ? "day" : "days"}</>}
        </span>
        {renew != null && <span className="tabular-nums"> · renews in {renew} {renew === 1 ? "day" : "days"}</span>}
        {onVacation && " · On vacation"}
      </p>
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
