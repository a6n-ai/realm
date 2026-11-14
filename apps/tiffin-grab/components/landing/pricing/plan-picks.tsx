import { getMoneyFormatter } from "@/lib/services/app-settings.service";
import { MON_FRI } from "@/lib/deliveries/schedule/delivery-days";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MealParts } from "@/components/landing/meal-parts";
import { makeCategoryLook } from "@/components/kit/category-look";
import type { MathFrequency, MathLength } from "@/components/landing/price-math";

export type PickSize = { id: string; name: string; rate: number; days: string[]; parts: string[]; kcalMin: number; kcalMax: number };
export type PickPlan = { key: string; label: string; sizes: PickSize[] };


// Cheapest, a middle and the dearest size; fewer than three sizes just show fewer cards.
function picksFor(sizes: PickSize[], lengths: MathLength[]) {
  const ladder = [...sizes].sort((a, b) => a.rate - b.rate);
  const n = ladder.length;
  const mid = Math.floor((n - 1) / 2);
  const four = lengths.find((l) => l.weeks === 4) ?? lengths.find((l) => l.off > 0) ?? lengths[0]!;
  const longest = [...lengths].reverse().find((l) => l.off > 0) ?? lengths[lengths.length - 1]!;
  return [...new Set([0, mid, n - 1])].map((i) => ({ size: ladder[i]!, length: i === n - 1 && n > 1 ? longest : four, good: n >= 3 && i === mid }));
}

export async function PlanPicks({ plans, lengths, weekdayFreq, maxPct = 25 }: { plans: PickPlan[]; lengths: MathLength[]; weekdayFreq?: MathFrequency; maxPct?: number }) {
  const money = await getMoneyFormatter();
  const sets = plans.filter((p) => p.sizes.length > 0);
  if (sets.length === 0 || lengths.length === 0) return null;
  return (
    <section id="picks" aria-labelledby="tg-picks" className="lp-picks">
      <div className="lp-head lp-head--split">
        <h2 id="tg-picks" className="lp-h2">Three ready <span className="c-accent">plans.</span></h2>
      </div>
      {sets.length > 1 ? (
        <div className="lp-picks__switch" role="radiogroup" aria-label="Diet">
          {sets.map((p, i) => (
            <label key={p.key} className="lp-picks__opt">
              <input type="radio" name="pick-diet" value={p.key} defaultChecked={i === 0} className="sr-only" />
              <span>{p.label}</span>
            </label>
          ))}
        </div>
      ) : null}
      <div className="lp-picks__sets">
        {sets.map((p) => {
          const look = makeCategoryLook();
          return (
            <div key={p.key} className="lp-picks__set" data-plan={p.key}>
              {picksFor(p.sizes, lengths).map(({ size, length, good }) => {
                const days = size.days.filter((d) => (MON_FRI as readonly string[]).includes(d));
                const gross = size.rate * days.length * length.weeks;
                const weekday = weekdayFreq && days.length === 5 ? weekdayFreq : null;
                const delivery = weekday?.off[length.weeks] ?? 0;
                const pct = Math.min(maxPct, length.off + delivery);
                const total = gross - gross * (pct / 100);
                const q = new URLSearchParams({ p: p.key, m: size.id, w: String(length.weeks) });
                if (weekday) q.set("f", weekday.key);
                return (
                  <article key={size.id} className="lp-tile lp-pick" data-good={good || undefined}>
                    {good ? <span className="lp-pick__flag">A good place to start</span> : null}
                    <h3 className="lp-tile__title">{size.name}</h3>
                    <p className="lp-pick__rate"><strong>{money(size.rate)}</strong>{" "}<small>a tiffin</small></p>
                    <MealParts parts={size.parts} look={look} />
                    <small className="lp-pick__kcal">{size.kcalMin} to {size.kcalMax} kcal</small>
                    {/* {" "} between flex items: invisible here, but keeps "Total, before tax $186" apart in search snippets. */}
                    <dl className="lp-pick__math">
                      <div><dt>Plan</dt>{" "}<dd>{days.length} {days.length === 1 ? "day" : "days"} × {length.weeks} wk</dd></div>
                      {length.off > 0 ? <div><dt>Length discount</dt>{" "}<dd>{length.off}% off</dd></div> : null}
                      {delivery > 0 ? <div><dt>Delivery discount</dt>{" "}<dd>{delivery}% off</dd></div> : null}
                      <div className="lp-pick__total"><dt>Total, before tax</dt>{" "}<dd>{money(total)}</dd></div>
                    </dl>
                    <Link prefetch={false} href={`/subscribe?${q}`} className="lp-cta">Start this plan<ArrowRight aria-hidden className="size-4" strokeWidth={2.2} /></Link>
                  </article>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
