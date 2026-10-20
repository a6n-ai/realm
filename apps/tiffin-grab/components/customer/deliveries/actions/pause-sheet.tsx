"use client";
import { useEffect, useState, useTransition } from "react";
import { humanDate } from "@/lib/deliveries-view";
import { loadMyPauseDays, pauseMyDays, releaseMyDays, type PauseDayChoice } from "@/app/(customer)/me/deliveries/actions";
import { MOVE_DAY_LABEL, RESUME_ALL_LABEL, RESUME_DAY_LABEL } from "../action-model";
import { pausedLine, resumeLine } from "../pause-copy";
import { KIT_UI } from "./sheet-ui";
import type { ActionSheetProps } from "./types";

const MUTED = "text-[var(--muted-foreground,#6E6558)]";
const heading = `text-xs font-semibold uppercase tracking-[0.12em] ${MUTED}`;

/** Drawer in the Edit meal family. Days are chosen here, not on the calendar. The server decides which days are pausable and refuses the rest. */
export function PauseSheet({ plan, open, onDone, onMove, ui }: Omit<ActionSheetProps, "trip"> & { trip?: ActionSheetProps["trip"]; /** Opens Move for that paused day; the shell closes this drawer. */ onMove?: (date: string) => void }) {
  const { Shell, PrimaryButton, SecondaryButton, OptionCard, Notice, Reason, Loading } = { ...KIT_UI, ...ui };
  const [pending, start] = useTransition();
  const [days, setDays] = useState<PauseDayChoice[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { limits, usage } = plan.pause;
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
      else setDays(res.days);
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

  const blocked = !days ? "Loading deliveries."
    : openDays.length === 0 ? "No deliveries left to pause."
    : limitReached ?? (picked.length === 0 ? "Choose a delivery day." : undefined);

  const toggle = (date: string) => setPicked((cur) => (cur.includes(date) ? cur.filter((d) => d !== date) : atCap ? cur : [...cur, date]));

  const commit = () => start(async () => {
    setError(null);
    const res = await pauseMyDays(plan.orderId, picked);
    if ("error" in res) return setError(res.error);
    if (res.paused.length === 0) return setError("Nothing was paused. Those days are past their cutoff.");
    onDone(pausedLine(res.paused, res.skipped));
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
            {picked.length > 1 ? `Pause ${picked.length} deliveries` : "Pause this delivery"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-5 pb-2">
        <p className={`text-[15px] ${MUTED}`}>
          Pause a delivery before its cutoff. You can put that same day back until its cutoff, or move it to another day at any time.
        </p>
        {budget.length > 0 && (
          <ul className="space-y-1">
            {budget.map((b) => <li key={b}><Reason>{b}</Reason></li>)}
          </ul>
        )}
        {limitReached && days != null && <Notice>{limitReached}.</Notice>}
        {days == null && !error ? <Loading /> : null}
        {openDays.length > 0 && !limitReached && (
          <section className="space-y-2" aria-label="Upcoming deliveries">
            <h3 className={heading}>Upcoming</h3>
            {openDays.map((d) => {
              const on = picked.includes(d.date);
              return (
                <OptionCard
                  key={d.date}
                  selected={on}
                  aria-disabled={(!on && atCap) || undefined}
                  className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-[15px]"
                  onClick={() => toggle(d.date)}
                >
                  <span className="font-semibold">{humanDate(d.date)}</span>
                  <span className={`text-[13px] ${MUTED}`}>{on ? "Selected" : "Delivering"}</span>
                </OptionCard>
              );
            })}
            {atCap && <Reason>You can pause up to {cap} {cap === 1 ? "day" : "days"} at once.</Reason>}
          </section>
        )}
        {paused.length > 0 && (
          <section className="space-y-2" aria-label="Paused deliveries">
            <div className="flex items-center justify-between gap-3">
              <h3 className={heading}>Paused</h3>
              {resumable.length > 1 && <SecondaryButton pending={pending} onClick={() => release("all")}>{RESUME_ALL_LABEL}</SecondaryButton>}
            </div>
            {paused.map((d) => (
              <div key={d.date} className="flex min-h-11 w-full items-center justify-between gap-3 py-1 text-[15px]">
                <span className="font-semibold">{humanDate(d.date)}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {!d.lapsed && <SecondaryButton pending={pending} onClick={() => release([d.date])}>{RESUME_DAY_LABEL}</SecondaryButton>}
                  {onMove && <SecondaryButton pending={pending} onClick={() => onMove(d.date)}>{MOVE_DAY_LABEL}</SecondaryButton>}
                </span>
              </div>
            ))}
          </section>
        )}
        {days != null && openDays.length === 0 && paused.length === 0 && (
          <Reason>No upcoming deliveries can be paused.</Reason>
        )}
      </div>
    </Shell>
  );
}
