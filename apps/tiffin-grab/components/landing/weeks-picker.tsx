"use client";

import { useState } from "react";

type Length = { weeks: number; off: number };

/** Fires on window so the figure's calendar fills the picked number of weeks (see LandingMotion). */
const WEEKS_EVENT = "tg:weeks";

// Plan lengths as selectable cards. Picking one fills the figure's calendar week by
// week; it does not change any plan.
export function WeeksPicker({ lengths, initial }: { lengths: Length[]; initial: number }) {
  const [picked, setPicked] = useState(initial);
  const pick = (weeks: number) => {
    setPicked(weeks);
    dispatchEvent(new CustomEvent(WEEKS_EVENT, { detail: weeks }));
  };

  return (
    <div className="tg-options tg-options--weeks" role="radiogroup" aria-label="Plan length">
      {lengths.map((l) => (
        <button
          key={l.weeks}
          type="button"
          role="radio"
          aria-checked={picked === l.weeks}
          className="tg-option tg-weeks"
          data-weeks={l.weeks}
          onClick={() => pick(l.weeks)}
        >
          <strong>{l.weeks}</strong>
          <span>{l.weeks === 1 ? "week" : "weeks"}</span>
          {l.off > 0 ? <em>{l.off}% off</em> : null}
        </button>
      ))}
    </div>
  );
}
