"use client";

import { useState } from "react";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

// A sample five-day week, not anyone's real plan: held days come back after the
// last delivery, on the plan's own weekdays, in order (Mon, Tue, ...).
export function WeekBend() {
  const [held, setHeld] = useState<number[]>([2]);
  const toggle = (i: number) => setHeld((h) => (h.includes(i) ? h.filter((x) => x !== i) : [...h, i].sort()));

  return (
    <div className="tg-bend__rows">
      <div className="tg-bend__row" role="group" aria-label="Sample week">
        <span className="tg-bend__label">A sample week. Tap a day to hold it.</span>
        {WEEK.map((d, i) => {
          const isHeld = held.includes(i);
          return (
            <button
              key={d}
              type="button"
              className="tg-daypill"
              aria-pressed={isHeld}
              onClick={() => toggle(i)}
            >
              <b>{d}</b>
              <span>{isHeld ? "held" : "tiffin"}</span>
            </button>
          );
        })}
      </div>
      <div className="tg-bend__row" aria-live="polite">
        <span className="tg-bend__label">
          {held.length === 0 ? "Nothing held, so nothing is added." : `Added after your last delivery: ${held.length} ${held.length === 1 ? "tiffin" : "tiffins"}.`}
        </span>
        {held.map((_, k) => (
          <span key={k} className="tg-daypill tg-daypill--added tg-drop" aria-hidden>
            <b>{WEEK[k % WEEK.length]}</b>
            <span>added</span>
          </span>
        ))}
      </div>
    </div>
  );
}
