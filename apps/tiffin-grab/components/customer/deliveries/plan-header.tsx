"use client";
import Link from "next/link";
import type { Subscription, SubscriptionWindow, TiffinCounts } from "@/lib/services/customer-deliveries.service";

const HEX = /^#[0-9a-fA-F]{6}$/;

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Running · to Sep 25" / "Starts Oct 26" / "Finished": tells same-sized plans apart. */
function windowLabel(w: SubscriptionWindow | undefined, today: string): string | null {
  if (!w) return null;
  if (w.next == null) return "Finished";
  return w.first > today ? `Starts ${shortDate(w.first)}` : `Running · to ${shortDate(w.last)}`;
}

export function PlanHeader({
  sub, subs, windows, today, counts, renew, onVacation, onVacationClick, subHref,
}: {
  sub: Subscription;
  subs: Subscription[];
  windows: Record<string, SubscriptionWindow>;
  today: string;
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
        <nav aria-label="Your plans" className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-wrap">
          {[...subs]
            .sort((a, b) => (windows[a.publicId]?.first ?? "").localeCompare(windows[b.publicId]?.first ?? ""))
            .map((s) => {
              const current = s.publicId === sub.publicId;
              const label = windowLabel(windows[s.publicId], today);
              return (
                <Link
                  key={s.publicId}
                  href={subHref(s.publicId)}
                  aria-current={current ? "true" : undefined}
                  className={`flex min-h-11 shrink-0 flex-col justify-center rounded-2xl border-[1.5px] px-4 py-1.5 text-left [touch-action:manipulation] ${current ? "border-[var(--primary)] bg-[var(--primary-wash,#FBE3D2)]" : "border-[var(--border)] bg-[var(--card,#fff)]"}`}
                >
                  <span className="text-sm font-semibold leading-tight">{s.mealSizeName}{s.status === "paused" ? " (paused)" : ""}</span>
                  {label && <span className="text-xs leading-tight text-[var(--muted-foreground,#6E6558)]">{label}</span>}
                </Link>
              );
            })}
        </nav>
      )}
    </header>
  );
}
