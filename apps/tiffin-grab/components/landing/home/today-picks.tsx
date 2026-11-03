"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

const STEP_MS = 2400;

/** Hero "pick one" rows. The pick walks from dish to dish on its own, as if someone were
 *  choosing today's sabzi: the chosen chip fills saffron and gains a check. It holds while
 *  the card is hovered or focused, off screen, or the tab is hidden; reduced motion keeps the
 *  first dish picked and still. */
export function TodayPicks({ rows }: { rows: { row: string; dishes: string[] }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const card = el.closest("article") ?? el;
    let visible = false, held = false, timer = 0;
    const sync = () => {
      clearInterval(timer);
      if (visible && !held && !document.hidden) timer = window.setInterval(() => setTick((t) => t + 1), STEP_MS);
    };
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; sync(); });
    io.observe(card);
    const hold = () => { held = true; sync(); };
    const release = () => { held = false; sync(); };
    card.addEventListener("pointerenter", hold);
    card.addEventListener("pointerleave", release);
    card.addEventListener("focusin", hold);
    card.addEventListener("focusout", release);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(timer);
      io.disconnect();
      card.removeEventListener("pointerenter", hold);
      card.removeEventListener("pointerleave", release);
      card.removeEventListener("focusin", hold);
      card.removeEventListener("focusout", release);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <div ref={ref} className="contents">
      {rows.map((c, r) => {
        const shown = c.dishes.slice(0, 3);
        // Rows after the first lag by one step so two rows never change on the same beat.
        const picked = (tick + r) % shown.length;
        return (
          <div key={c.row} className="lp-today__row">
            <span className="lp-today__label">{c.row} · pick one</span>
            <ul className="lp-today__chips">
              {shown.map((d, i) => (
                <li key={d} data-picked={i === picked || undefined}>
                  <Check aria-hidden className="lp-today__check" strokeWidth={3} />
                  {d}
                </li>
              ))}
              {c.dishes.length > 3 ? <li className="lp-today__more">+{c.dishes.length - 3} more</li> : null}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
