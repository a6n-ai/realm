"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, DateStrip, Notice, Reason, Sheet, Toast, Toggle, type StripDay } from "@/components/customer/kit";
import { buildVacationPauseRequest } from "@/app/(customer)/me/deliveries/vacation-pause";
import { pauseMySubscription, resumeMySubscription } from "@/app/(customer)/me/deliveries/actions";
import { humanDate } from "@/lib/deliveries-view";
import type { ActionSheetProps } from "./types";

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const span = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const label = "text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground,#6E6558)]";

/** Not a trip action: never reads `trip`, so the shell may mount it with any placeholder trip. */
export function VacationSheet({ plan, open, onDone }: ActionSheetProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [start_, setStart] = useState<string | null>(null);
  const { limits, usage } = plan.pause;
  const stretch = limits?.maxPauseStretchDays ?? null;
  const endRequired = stretch != null;
  const [withEnd, setWithEnd] = useState(endRequired);
  const [end, setEnd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const onVacation = plan.sub.status === "paused" || !!plan.ctx.onVacation;
  const left = limits?.maxPauses == null ? null : Math.max(limits.maxPauses - (usage?.count ?? 0), 0);

  const budget = [
    limits?.maxPauseDaysTotal != null && `${usage?.daysUsed ?? 0} of ${limits.maxPauseDaysTotal} vacation days used`,
    left != null && `${left} vacation${left === 1 ? "" : "s"} left`,
    stretch != null && `Up to ${stretch} consecutive days per vacation`,
  ].filter(Boolean) as string[];

  const startDays: StripDay[] = span(plan.today, 30).map((date) => ({ date }));
  const endDays: StripDay[] = start_
    ? span(start_, 30).map((date) => ({ date, disabledReason: stretch != null && date > addDays(start_, stretch - 1) ? `Longer than ${stretch} days` : undefined }))
    : [];

  const blocked = onVacation
    ? undefined
    : left === 0 ? "You've used all your vacation stretches" : !start_ ? "Choose a start date." : withEnd && !end ? "Choose an end date." : undefined;

  const commit = () =>
    start(async () => {
      setError(null);
      const res = onVacation
        ? await resumeMySubscription(plan.orderId)
        : await pauseMySubscription(plan.orderId, buildVacationPauseRequest(start_!, withEnd ? end! : ""));
      if ("error" in res) return setError(res.error);
      router.refresh();
      setDone(onVacation ? "Deliveries resumed." : "Vacation set.");
    });

  const cta = onVacation ? "Resume deliveries" : "Pause deliveries";
  const summary = onVacation
    ? "Paused trips return to your schedule. Days already missed move to your pool."
    : !start_
      ? null
      : withEnd && end
        ? `Trips from ${humanDate(start_)} to ${humanDate(end)} are paused. Trips whose cutoff already passed still go out. Resume appends undelivered days after your last day.`
        : `No end date: deliveries stay paused until you resume. Trips whose cutoff already passed still go out.`;

  return (
    <>
      <Sheet
        open={open && !done}
        onClose={onDone}
        title={onVacation ? "Resume deliveries" : "Pause deliveries"}
        footer={
          <>
            {error && <Notice tone="error" className="mb-3">{error}</Notice>}
            <Button variant="primary" size="lg" className="w-full" pending={pending} disabledReason={blocked} onClick={commit}>
              {cta}
            </Button>
          </>
        }
      >
        <div className="space-y-5 pb-2">
          {onVacation ? (
            <p className="text-[15px]">Deliveries are paused for this plan. Resume to start them again.</p>
          ) : (
            <>
              <p className="text-[15px] text-[var(--muted-foreground,#6E6558)]">Away from home? Pause every trip in a date range. Skipped tiffins are added after your last delivery.</p>
              {budget.length > 0 && (
                <ul className="space-y-1">
                  {budget.map((b) => <li key={b}><Reason>{b}</Reason></li>)}
                </ul>
              )}
              <section className="space-y-2">
                <h3 className={label}>Start (today allowed)</h3>
                <DateStrip
                  label="Start date"
                  days={startDays}
                  value={start_}
                  onChange={(d) => (setStart(d), setError(null), end && end < d && setEnd(null))}
                />
              </section>
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[15px] font-semibold">End date</h3>
                  <Toggle label="End date" checked={withEnd} disabled={endRequired} onChange={(v) => (setWithEnd(v), !v && setEnd(null))} />
                </div>
                {endRequired && <Reason>{`This plan needs an end date (max ${stretch} days)`}</Reason>}
                {withEnd && (start_ ? <DateStrip label="End date" days={endDays} value={end} onChange={setEnd} /> : <Reason>Pick a start date first.</Reason>)}
              </section>
            </>
          )}
          {summary && (
            <div className="rounded-3xl border border-[var(--border)] p-4">
              <h3 className="mb-1 text-[15px] font-bold">What happens</h3>
              <p className="text-[15px]">{summary}</p>
            </div>
          )}
        </div>
      </Sheet>
      <Toast open={done !== null} onClose={onDone}>{done}</Toast>
    </>
  );
}
