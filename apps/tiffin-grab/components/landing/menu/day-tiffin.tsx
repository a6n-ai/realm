"use client";

import { useMemo, useState } from "react";
import { IconTile } from "@/components/kit/icon-tile";
import { makeCategoryLook } from "@/components/kit/category-look";

export type TiffinDay = { key: string; label: string; short: string; date: string; today: boolean; tiers: { row: string; dishes: string[] }[]; popular: string[] };

export function DayTiffin({ days }: { days: TiffinDay[] }) {
  const [picked, setPicked] = useState(() => Math.max(0, days.findIndex((d) => d.today)));
  const day = days[picked];
  // One lookup for the whole week, so a category keeps its tile colour from day to day.
  const look = useMemo(() => { const l = makeCategoryLook(); return new Map([...new Set(days.flatMap((d) => d.tiers.map((t) => t.row)))].map((r) => [r, l(r)])); }, [days]);
  if (!day) return null;
  const order = days.map((_, i) => i).sort((a, b) => (days[b]!.today ? 1 : 0) - (days[a]!.today ? 1 : 0) || a - b);

  return (
    <div className="mn-tiffin">
      <div className="mn-days" aria-label="Pick a day">
        {order.map((i) => {
          const d = days[i]!;
          return (
            <button key={d.key} type="button" className="mn-day" aria-pressed={i === picked} onClick={() => setPicked(i)}>
              <strong>{d.short}</strong>
              <span>{d.today ? "Today" : d.date.replace(/^\w+\s/, "")}</span>
            </button>
          );
        })}
      </div>
      <h3 className="lp-h2 lp-h2--sm mn-tiffin__title">{day.today ? "Today’s tiffin" : `${day.label}’s tiffin`}<span>{day.today ? day.date : null}</span></h3>
      <ol className="mn-stack" aria-label={`${day.label} tiffin, tier by tier`}>
        {day.tiers.map((t) => (
          <li key={t.row} className="mn-tier">
            <span className="mn-tier__label">
              {(() => { const l = look.get(t.row); return l ? <IconTile tint={l.tint} className="mn-tier__icon"><l.icon /></IconTile> : null; })()}
              {t.row}{t.dishes.length > 1 ? <small>Pick one</small> : null}
            </span>
            {t.dishes.length > 1 ? (
              <ul className="mn-tier__opts">{t.dishes.map((n) => <li key={n}>{n}{day.popular.includes(n) ? <em>Popular</em> : null}</li>)}</ul>
            ) : (
              <p className="mn-tier__dish">{t.dishes[0]}{day.popular.includes(t.dishes[0]!) ? <em>Popular</em> : null}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
