"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Heart } from "lucide-react";
import type { BoardDay } from "@/components/landing/week-board";
import type { BoardWeekend } from "@/lib/landing/week-board";
import { MenuPickDemo } from "@/components/landing/stage/menu-pick-demo";
import { Tilt } from "@/components/landing/home/tilt";

/** This week's menu as one board: a liquid-glass day switcher (a tablist, arrow keys move it)
 *  and the chosen day's tiffin, grouped by row. Switching days re-plates the board in place,
 *  the section's one signature moment. The phone beside it replays the app's Edit meal flow
 *  with the chosen day's real dishes (keyed by day, so a new day restarts its story). */
export function MenuBoard({ days, rows, weekend, cutoffTime }: { days: BoardDay[]; rows: string[]; weekend: BoardWeekend | null; cutoffTime: string | null }) {
  const start = Math.max(0, days.findIndex((d) => d.today));
  const [i, setI] = useState(start);
  // The dish the phone demo just saved: lit on the board while its "Meals saved" toast shows.
  const [saved, setSaved] = useState<string | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const day = days[i] ?? days[0];
  if (!day) return null;

  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? days.length - 1 : step ? (i + step + days.length) % days.length : -1;
    if (to < 0) return;
    e.preventDefault();
    setI(to);
    tabs.current[to]?.focus();
  };

  const filled = rows.filter((r) => (day.dishes[r] ?? []).length > 0);
  const choices = filled.filter((r) => day.dishes[r]!.length > 1);
  const fixed = filled.filter((r) => day.dishes[r]!.length === 1);
  const popular = new Set(day.popular ?? []);

  return (
    <div className="lp-menu__grid">
      <div className="lp-menu__main">
        <div className="lp-days lp-glass-light lp-bevel" role="tablist" aria-label="Day of the week" onKeyDown={onKey} style={{ "--n": days.length, "--i": i } as CSSProperties}>
          <span className="lp-days__thumb" aria-hidden />
          {days.map((d, k) => (
            <button
              key={d.key}
              ref={(el) => { tabs.current[k] = el; }}
              type="button"
              role="tab"
              id={`lp-day-${d.key}`}
              aria-selected={k === i}
              aria-controls="lp-day-panel"
              tabIndex={k === i ? 0 : -1}
              className="lp-days__tab"
              data-today={d.today}
              onClick={() => setI(k)}
            >
              <span>{d.short}</span>
              <small>{d.today ? "Today" : d.date.replace(/^\D+/, "")}</small>
            </button>
          ))}
        </div>

        <Tilt>
        <article id="lp-day-panel" role="tabpanel" aria-labelledby={`lp-day-${day.key}`} className="lp-plate lp-glass-light lp-bevel">
          {/* Keyed by day: the board re-plates (fades up) when the day changes. */}
          <div key={day.key} className="lp-plate__in">
            <header className="lp-plate__head">
              <h3>{day.label}</h3>
              <span>{day.date}</span>
            </header>
            {filled.length > 0 ? (
              <dl className="lp-plate__rows">
                {choices.map((r, k) => (
                  <div key={r} style={{ "--k": k } as CSSProperties}>
                    <dt>{r}</dt>
                    <dd>
                      {day.dishes[r]!.map((dish) => (
                        <span key={dish} className="lp-dish" data-saved={dish === saved || undefined}>
                          {dish}
                          {popular.has(dish) ? <Heart aria-label="Popular" className="size-3 fill-current" /> : null}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
                {/* Rows with one dish (rice, roti, raita...) share one line, each chip naming its row. */}
                {fixed.length > 0 ? (
                  <div style={{ "--k": choices.length } as CSSProperties}>
                    <dt>{choices.length > 0 ? "With it" : "In the tiffin"}</dt>
                    <dd>
                      {fixed.map((r) => (
                        <span key={r} className="lp-dish lp-dish--fixed">{day.dishes[r]![0]!.toLowerCase() === r.toLowerCase() ? null : <small>{r}</small>}{day.dishes[r]![0]}</span>
                      ))}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : <p className="lp-plate__empty">No tiffins this day.</p>}
            <p className="lp-plate__foot">
              {choices.length > 0
                ? `Subscribers pick their ${choices.map((r) => r.toLowerCase()).join(" and ")} in the app${cutoffTime ? `, until ${cutoffTime} the day before` : ""}.`
                : "Every tiffin comes with all of these."}
              {popular.size > 0 ? <span className="lp-plate__legend"><Heart aria-hidden className="size-3 fill-current" /> Most picked this week</span> : null}
            </p>
          </div>
        </article>
        </Tilt>
        {/* Sat and Sun share one weekend menu: it belongs to the week board, so it sits right under it. */}
        {weekend ? (
          <section className="lp-weekend lp-glass-light lp-bevel" aria-label="Weekend menu">
            <header>
              <h3>Weekend</h3>
              <span>{weekend.today ? <em>Today</em> : null}{weekend.date}</span>
            </header>
            <p>{weekend.dishes.map((d) => <span key={d} className="lp-dish">{d}</span>)}</p>
          </section>
        ) : null}
      </div>
      <div className="lp-menu__aside">
        <MenuPickDemo key={day.key} dayLabel={day.label} dayShort={day.short} cutoffTime={cutoffTime} onSaved={setSaved} options={filled.map((r) => ({ category: r, dishes: day.dishes[r] ?? [] }))} />
      </div>
    </div>
  );
}
