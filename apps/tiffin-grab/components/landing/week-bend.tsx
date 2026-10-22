"use client";

import { useState } from "react";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

// A sample five-day week, not anyone's real plan. A paused day is only added back after the
// last delivery when the plan's "Add paused days to the end" switch is on, so the demo has it too.
export function WeekBend() {
  const [paused, setPaused] = useState<number[]>([2]);
  const [toEnd, setToEnd] = useState(true);
  const toggle = (i: number) => setPaused((h) => (h.includes(i) ? h.filter((x) => x !== i) : [...h, i].sort()));

  return (
    <div className="tg-bend__rows">
      <div className="tg-bend__row" role="group" aria-label="Sample week">
        <span className="tg-bend__label">A sample week. Tap a day to pause it.</span>
        {WEEK.map((d, i) => {
          const isPaused = paused.includes(i);
          return (
            <button key={d} type="button" className="tg-daypill" aria-pressed={isPaused} onClick={() => toggle(i)}>
              <b>{d}</b>
              <span>{isPaused ? "paused" : "tiffin"}</span>
            </button>
          );
        })}
      </div>
      <label className="tg-bend__label flex items-center gap-2">
        <input type="checkbox" checked={toEnd} onChange={(e) => setToEnd(e.target.checked)} className="size-4 accent-[var(--primary)]" />
        Add paused days to the end of my plan
      </label>
      <div className="tg-bend__row" aria-live="polite">
        <span className="tg-bend__label">
          {paused.length === 0
            ? "Nothing paused, so nothing moves."
            : toEnd
              ? `Added after your last delivery: ${paused.length} ${paused.length === 1 ? "tiffin" : "tiffins"}.`
              : `${paused.length} paused ${paused.length === 1 ? "tiffin waits" : "tiffins wait"} for you to move ${paused.length === 1 ? "it" : "them"} to a day you pick.`}
        </span>
        {toEnd && paused.map((_, k) => (
          <span key={k} className="tg-daypill tg-daypill--added tg-drop" aria-hidden>
            <b>{WEEK[k % WEEK.length]}</b>
            <span>added</span>
          </span>
        ))}
      </div>
    </div>
  );
}
