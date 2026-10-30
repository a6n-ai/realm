"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import "./week-board.css";

export type BoardDay = { key: string; label: string; short: string; date: string; today: boolean; dishes: Record<string, string[]>; popular?: string[] };

/** A dish name, tagged when customers pick it most in its row that day. */
function Dish({ name, popular }: { name: string; popular: boolean }) {
  return (
    <>
      {name}
      {popular ? <span className="tg-board__pop"><Heart aria-hidden className="size-3 fill-current" />Popular</span> : null}
    </>
  );
}
type Weekend = { date: string; today: boolean; dishes: string[] };

// The week as a menu board: dish types down the side, days across, today lit.
// Phones read one day at a time behind a day strip that opens on today.
export function WeekBoard({ days, rows, weekend }: { days: BoardDay[]; rows: string[]; weekend?: Weekend | null }) {
  const [picked, setPicked] = useState(() => Math.max(0, days.findIndex((d) => d.today)));
  const day = days[picked];

  return (
    <div className="tg-board">
      {weekend ? (
        <div className="tg-card tg-board__weekend" data-today={weekend.today || undefined}>
          <div className="flex flex-col gap-0.5">
            <span className="tg-board__type">Weekend dish</span>
            <span className="c-caption">{weekend.today ? "Today, " : ""}{weekend.date}</span>
          </div>
          <strong>{weekend.dishes.join(", ")}</strong>
        </div>
      ) : null}
      <div className="tg-board__grid tg-card" style={{ "--cols": days.length } as React.CSSProperties} role="table" aria-label="This week's menu">
        <div role="row" className="tg-board__row tg-board__row--head">
          <span role="columnheader" className="tg-board__corner" />
          {days.map((d) => (
            <span key={d.key} role="columnheader" className="tg-board__day" data-today={d.today || undefined}>
              <strong>{d.label}</strong>
              <span>{d.today ? "Today" : d.date}</span>
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row} role="row" className="tg-board__row">
            <span role="rowheader" className="tg-board__type">{row}</span>
            {days.map((d) => (
              <span key={d.key} role="cell" className="tg-board__cell" data-today={d.today || undefined}>
                {(d.dishes[row] ?? []).map((name) => <span key={name}><Dish name={name} popular={!!d.popular?.includes(name)} /></span>)}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="tg-board__phone">
        <div className="tg-board__strip" role="tablist" aria-label="Day">
          {days.map((d, i) => (
            <button key={d.key} type="button" role="tab" aria-selected={i === picked} className="tg-board__tab" data-today={d.today || undefined} onClick={() => setPicked(i)}>
              <strong>{d.short}</strong>
              <span>{d.today ? "Today" : d.date.replace(/^\w+\s/, "")}</span>
            </button>
          ))}
        </div>
        {day ? <div className="tg-card tg-board__one" role="tabpanel" aria-label={day.label}>
          <h2 className="m-0 text-xl font-bold tracking-tight">{day.label} <span className="c-caption font-medium">{day.today ? "Today" : day.date}</span></h2>
          {rows.filter((r) => day.dishes[r]?.length).map((r) => (
            <div key={r} className="tg-board__group">
              <span className="tg-board__type">{r}</span>
              <ul>{day.dishes[r]!.map((n) => <li key={n}><Dish name={n} popular={!!day.popular?.includes(n)} /></li>)}</ul>
            </div>
          ))}
        </div> : null}
      </div>
    </div>
  );
}
