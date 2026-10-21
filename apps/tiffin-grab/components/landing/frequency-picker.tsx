"use client";

import { useState } from "react";

const WEEK = [
  ["mon", "M"], ["tue", "T"], ["wed", "W"], ["thu", "T"], ["fri", "F"], ["sat", "S"], ["sun", "S"],
] as const;

type Frequency = { publicId: string; name: string; daysPerWeek: number; weekdays: string[] | null };

/** Fires on window so the figure's day tiles follow the picked frequency (see LandingMotion). */
const DAYS_EVENT = "tg:days";

// Delivery rhythms as selectable cards with their week drawn out. Picking one
// lights the same days on the figure's tiles; it does not change any plan.
export function FrequencyPicker({ frequencies }: { frequencies: Frequency[] }) {
  const daysOf = (f: Frequency) => f.weekdays ?? WEEK.slice(0, f.daysPerWeek).map(([d]) => d);
  const [picked, setPicked] = useState(frequencies[0]?.publicId ?? null);
  const pick = (f: Frequency) => {
    setPicked(f.publicId);
    dispatchEvent(new CustomEvent(DAYS_EVENT, { detail: daysOf(f) }));
  };

  return (
    <div className="tg-options mt-6" role="radiogroup" aria-label="Delivery days">
      {frequencies.map((f) => {
        const days = daysOf(f);
        const on = picked === f.publicId;
        return (
          <button
            key={f.publicId}
            type="button"
            role="radio"
            aria-checked={on}
            className="tg-option"
            data-freq={days.join(",")}
            onClick={() => pick(f)}
            onPointerEnter={() => pick(f)}
          >
            <span className="tg-option__body">
              <strong>{f.name}</strong>
              <span>{f.daysPerWeek} {f.daysPerWeek === 1 ? "tiffin" : "tiffins"} a week</span>
            </span>
            <span className="tg-week-strip" aria-hidden>
              {WEEK.map(([d, letter]) => (
                <span key={d} data-on={days.includes(d)}>{letter}</span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
