"use client";
import { useEffect, useState, useTransition } from "react";
import { loadMyPauseDays, pauseMyDays, releaseMyDays, setMyAutoMovePaused, type PauseDayChoice } from "@/app/(customer)/me/deliveries/actions";
import { PauseCalendar } from "./pause-calendar";
import { cutoffTime } from "@/lib/deliveries-view";
import { RESUME_ALL_LABEL } from "../action-model";
import { pausedLine, resumeLine } from "../pause-copy";
import { KIT_UI } from "./sheet-ui";
import type { ActionSheetProps } from "./types";

const MUTED = "text-[var(--muted-foreground,#6E6558)]";
const AUTO_MOVE_LABEL = "Add paused days to the end of my plan";

/** Drawer in the Edit meal family. Days are tapped on its own month grid, not on the page calendar. The server decides which days are pausable and refuses the rest. */
export function PauseSheet({ plan, open, onDone, onMove, ui }: Omit<ActionSheetProps, "trip"> & { trip?: ActionSheetProps["trip"]; /** Opens Move for that paused day; the shell closes this drawer. */ onMove?: (date: string) => void }) {
  const { Shell, PrimaryButton, SecondaryButton, Notice, Reason, Loading, Switch } = { ...KIT_UI, ...ui };
  const [pending, start] = useTransition();
  const [days, setDays] = useState<PauseDayChoice[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [resuming, setResuming] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [autoMove, setAutoMove] = useState<boolean | null>(null);
  const { limits, usage } = plan.pause;
  const cut = plan.ctx?.cutoffHour != null ? cutoffTime(plan.ctx.cutoffHour) : null;
  const left = limits?.maxPauses == null ? null : Math.max(limits.maxPauses - (usage?.count ?? 0), 0);
  const daysLeft = limits?.maxPauseDaysTotal == null ? null : Math.max(limits.maxPauseDaysTotal - (usage?.daysUsed ?? 0), 0);
  const stretch = limits?.maxPauseStretchDays ?? null;
  // One action pauses at most the stretch, and never more days than the budget has left.
  const cap = [stretch, daysLeft].filter((n): n is number => n != null).reduce<number | null>((m, n) => (m == null ? n : Math.min(m, n)), null);

  useEffect(() => {
    if (!open) return;
    // Mounted only while open, so state starts fresh each time.
    let cancel = false;
    loadMyPauseDays(plan.orderId).then((res) => {
      if (cancel) return;
      if ("error" in res) setError(res.error);
      else { setDays(res.days); setAutoMove(res.autoMove); }
    });
    return () => { cancel = true; };
  }, [open, plan.orderId]);

  const openDays = (days ?? []).filter((d) => !d.paused);
  const paused = (days ?? []).filter((d) => d.paused);
  // Resume only while the day's cutoff is ahead; a paused day past it can still be moved.
  const resumable = paused.filter((d) => !d.lapsed);
  const budget = [
    daysLeft != null && `${usage?.daysUsed ?? 0} of ${limits?.maxPauseDaysTotal} pause days used`,
    left != null && `${left} pause${left === 1 ? "" : "s"} left`,
    stretch != null && `Up to ${stretch} days at a time`,
  ].filter(Boolean) as string[];

  const limitReached = left === 0 ? "You've used all your pauses" : daysLeft === 0 ? "You've used all your pause days" : null;
  const atCap = cap != null && picked.length >= cap;

  const nothing = openDays.length === 0 && resumable.length === 0;
  const blocked = !days ? "Loading deliveries."
    : picked.length + resuming.length > 0 ? undefined
    : nothing ? "No deliveries left to pause."
    : limitReached && resumable.length === 0 ? limitReached
    : "Tap a day to pause or resume it.";
  const label = picked.length && resuming.length ? `Pause ${picked.length}, resume ${resuming.length}`
    : resuming.length ? (resuming.length > 1 ? `Resume ${resuming.length} deliveries` : "Resume this delivery")
    : picked.length > 1 ? `Pause ${picked.length} deliveries` : "Pause this delivery";

  const toggle = (date: string) => setPicked((cur) => (cur.includes(date) ? cur.filter((d) => d !== date) : atCap ? cur : [...cur, date]));

  const flipResume = (date: string) => setResuming((cur) => (cur.includes(date) ? cur.filter((d) => d !== date) : [...cur, date]));

  // Every day still open in one go, like Resume all; offered only when the limits allow all of them.
  const canPauseAll = !limitReached && openDays.length > 1 && (cap == null || cap >= openDays.length);
  const pauseAll = () => start(async () => {
    setError(null);
    const res = await pauseMyDays(plan.orderId, openDays.map((d) => d.date));
    if ("error" in res) return setError(res.error);
    if (res.paused.length === 0) return setError("Nothing was paused. Those days are past their cutoff.");
    onDone(pausedLine(res.paused, res.skipped));
  });

  // Pause first, then resume; each half reports what the server actually changed.
  const commit = () => start(async () => {
    setError(null);
    const lines: string[] = [];
    if (picked.length) {
      const res = await pauseMyDays(plan.orderId, picked);
      if ("error" in res) return setError(res.error);
      if (res.paused.length === 0) return setError("Nothing was paused. Those days are past their cutoff.");
      lines.push(pausedLine(res.paused, res.skipped));
    }
    if (resuming.length) {
      const res = await releaseMyDays(plan.orderId, resuming);
      if ("error" in res) return lines.length ? onDone(`${lines[0]} ${res.error}`) : setError(res.error);
      const line = resumeLine(res.dates, res.reclosed);
      if (!line && !lines.length) return setError("Nothing was resumed.");
      if (line) lines.push(line);
    }
    onDone(lines.join(" "));
  });

  const flip = (on: boolean) => start(async () => {
    setError(null);
    setAutoMove(on);
    const res = await setMyAutoMovePaused(plan.orderId, on);
    if ("error" in res) { setAutoMove(!on); return setError(res.error); }
    if (res.moved > 0) onDone(`Moved ${res.moved} paused ${res.moved === 1 ? "day" : "days"} to the end of your plan.`);
  });

  const release = (dates: string[] | "all") => start(async () => {
    setError(null);
    const res = await releaseMyDays(plan.orderId, dates);
    if ("error" in res) return setError(res.error);
    const line = resumeLine(res.dates, res.reclosed);
    if (!line) return setError("Nothing was resumed.");
    onDone(line);
  });

  return (
    <Shell
      open={open}
      onClose={() => onDone()}
      title="Pause deliveries"
      footer={
        <>
          {error && <Notice tone="error">{error}</Notice>}
          <PrimaryButton pending={pending} disabledReason={blocked} onClick={commit}>
            {label}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-5 pb-2">
        <p className={`text-[15px] ${MUTED}`}>
          {`Tap days to pause or resume${cut ? `, by ${cut} the day before` : " before the cutoff"}.`}
        </p>
        {autoMove != null && (
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-[15px] font-semibold">{AUTO_MOVE_LABEL}</p>
              <p className={`text-[13px] ${MUTED}`}>{autoMove ? "Moves after its cutoff, to the end of your plan." : "Stays paused. You move it."}</p>
            </div>
            <Switch label={AUTO_MOVE_LABEL} checked={autoMove} disabled={pending} onChange={flip} />
          </div>
        )}
        {budget.length > 0 && (
          <ul className="space-y-1">
            {budget.map((b) => <li key={b}><Reason>{b}</Reason></li>)}
          </ul>
        )}
        {limitReached && days != null && <Notice>{limitReached}.</Notice>}
        {days == null && !error ? <Loading /> : null}
        {days != null && (openDays.length > 0 || paused.length > 0) && (
          <section className="space-y-3" aria-label="Your deliveries">
            <PauseCalendar
              days={days}
              picked={picked}
              canPick={!limitReached}
              atCap={atCap}
              pending={pending}
              onPick={toggle}
              resuming={resuming}
              onResume={flipResume}
              onMove={onMove}
            />
            {atCap && <Reason>You can pause up to {cap} {cap === 1 ? "day" : "days"} at once.</Reason>}
            {(canPauseAll || resumable.length > 1) && (
              <div className="flex justify-end gap-2">
                {canPauseAll && <SecondaryButton pending={pending} onClick={pauseAll}>Pause all</SecondaryButton>}
                {resumable.length > 1 && <SecondaryButton pending={pending} onClick={() => release("all")}>{RESUME_ALL_LABEL}</SecondaryButton>}
              </div>
            )}
          </section>
        )}
        {days != null && openDays.length === 0 && paused.length === 0 && (
          <Reason>No upcoming deliveries can be paused.</Reason>
        )}
      </div>
    </Shell>
  );
}
