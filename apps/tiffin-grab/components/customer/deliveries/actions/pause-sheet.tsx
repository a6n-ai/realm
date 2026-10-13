"use client";
import { useEffect, useState, useTransition } from "react";
import { humanDate } from "@/lib/deliveries-view";
import { loadMyPauseDays, pauseMyDays, releaseMyDays, type PauseDayChoice } from "@/app/(customer)/me/deliveries/actions";
import { KIT_UI } from "./sheet-ui";
import type { ActionSheetProps } from "./types";

const row = "flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border-[1.5px] px-4 text-left text-[15px] [touch-action:manipulation]";

/** Drawer in the Edit meal family. Days are chosen here, not on the calendar. */
export function PauseSheet({ plan, open, onDone, ui }: Omit<ActionSheetProps, "trip"> & { trip?: ActionSheetProps["trip"] }) {
  const { Shell, PrimaryButton, Notice, Reason, Loading } = { ...KIT_UI, ...ui };
  const [pending, start] = useTransition();
  const [days, setDays] = useState<PauseDayChoice[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { limits, usage } = plan.pause;
  const left = limits?.maxPauses == null ? null : Math.max(limits.maxPauses - (usage?.count ?? 0), 0);
  const daysLeft = limits?.maxPauseDaysTotal == null ? null : Math.max(limits.maxPauseDaysTotal - (usage?.daysUsed ?? 0), 0);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setDays(null);
    setPicked([]);
    setError(null);
    loadMyPauseDays(plan.orderId).then((res) => {
      if (cancel) return;
      if ("error" in res) setError(res.error);
      else setDays(res.days);
    });
    return () => { cancel = true; };
  }, [open, plan.orderId]);

  const openDays = (days ?? []).filter((d) => !d.paused);
  const paused = (days ?? []).filter((d) => d.paused);
  const budget = [
    daysLeft != null && `${usage?.daysUsed ?? 0} of ${limits?.maxPauseDaysTotal} pause days used`,
    left != null && `${left} pause${left === 1 ? "" : "s"} left`,
    limits?.maxPauseStretchDays != null && `Up to ${limits.maxPauseStretchDays} days at a time`,
  ].filter(Boolean) as string[];

  const blocked = !days ? "Loading deliveries."
    : openDays.length === 0 ? "No deliveries left to pause."
    : left === 0 ? "You've used all your pauses"
    : daysLeft === 0 ? "You've used all your pause days"
    : picked.length === 0 ? "Choose a delivery day."
    : undefined;

  const toggle = (date: string) => setPicked((cur) => cur.includes(date) ? cur.filter((d) => d !== date) : [...cur, date]);

  const commit = () => start(async () => {
    setError(null);
    const res = await pauseMyDays(plan.orderId, picked);
    if ("error" in res) return setError(res.error);
    onDone(res.message ?? "Paused.");
  });

  const release = (dates: string[] | "all") => start(async () => {
    setError(null);
    const res = await releaseMyDays(plan.orderId, dates);
    if ("error" in res) return setError(res.error);
    onDone(res.message ?? "Back on.");
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
        <p className="text-[15px] text-[var(--muted-foreground,#6E6558)]">
          Pause a delivery before its cutoff. You can put that same day back, or move it to another day.
        </p>
        {budget.length > 0 && (
          <ul className="space-y-1">
            {budget.map((b) => <li key={b}><Reason>{b}</Reason></li>)}
          </ul>
        )}
        {days == null && !error ? <Loading /> : null}
        {openDays.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground,#6E6558)]">Upcoming</h3>
            {openDays.map((d) => {
              const on = picked.includes(d.date);
              return (
                <button
                  key={d.date}
                  type="button"
                  aria-pressed={on}
                  className={`${row} ${on ? "border-[var(--primary)] bg-[var(--primary-wash,#FBE3D2)]" : "border-[var(--border)] bg-[var(--card,#fff)]"}`}
                  onClick={() => toggle(d.date)}
                >
                  <span className="font-semibold">{humanDate(d.date)}</span>
                  <span className="text-[13px] text-[var(--muted-foreground,#6E6558)]">{on ? "Selected" : "Delivering"}</span>
                </button>
              );
            })}
          </section>
        )}
        {paused.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground,#6E6558)]">Paused</h3>
              {paused.length > 1 && (
                <button type="button" className="min-h-11 text-[15px] font-semibold text-[var(--primary)] [touch-action:manipulation]" disabled={pending} onClick={() => release("all")}>
                  Resume all
                </button>
              )}
            </div>
            {paused.map((d) => (
              <div key={d.date} className={`${row} border-[var(--border)]`}>
                <span className="font-semibold">{humanDate(d.date)}</span>
                <button type="button" className="min-h-11 font-semibold [touch-action:manipulation]" disabled={pending} onClick={() => release([d.date])}>
                  Resume this day
                </button>
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
