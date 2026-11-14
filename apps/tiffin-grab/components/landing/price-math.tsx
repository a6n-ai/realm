"use client";

import { useFormatMoney } from "@/components/app-currency";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Calculator, Hand } from "lucide-react";
import { planWeek, type DayOfWeek, MON_FRI } from "@/lib/deliveries/schedule/delivery-days";
import { consentMoment } from "@/components/consent/cookie-consent";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { round2 } from "@foundry/commons/util/money";

export type MathSize = { id: string; name: string; rate: number; days: DayOfWeek[] };
export type MathPlan = { key: string; label: string; sizes: MathSize[] };
export type MathLength = { weeks: number; off: number };
export type MathFrequency = { id: string; key: string; name: string; days: DayOfWeek[]; off: Record<number, number> };

const WEEK: { key: DayOfWeek; short: string }[] = [
  { key: "mon", short: "Mon" }, { key: "tue", short: "Tue" }, { key: "wed", short: "Wed" }, { key: "thu", short: "Thu" },
  { key: "fri", short: "Fri" }, { key: "sat", short: "Sat" }, { key: "sun", short: "Sun" },
];

/** The days to eat on: the wanted ones the size serves, kept within the min and max a week (topped up in week order). */
function fitDays(want: DayOfWeek[], size: MathSize, b: { min: number; max: number }): DayOfWeek[] {
  const open = WEEK.map((d) => d.key).filter((d) => size.days.includes(d));
  const max = Math.min(b.max, open.length), min = Math.min(b.min, max);
  const keep = open.filter((d) => want.includes(d)).slice(0, max);
  for (const d of open) if (keep.length < min && !keep.includes(d)) keep.push(d);
  return WEEK.map((d) => d.key).filter((d) => keep.includes(d));
}

/** Eases a shown number to its new value, so the total visibly adds up as you tap. Instant under reduced motion. */
function useTween(target: number, ms = 420): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(target); from.current = target; return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3);
      const v = a + (target - a) * e;
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

/**
 * "No packages. Just math." made live: pick a diet and size, tap the days you'd eat, pick a length, and
 * each term of rate × days × weeks fills in and the total adds up. Real catalogue rates and plan-length
 * discounts; an estimate before tax (add-ons, coupons and the exact total are the plan builder's job).
 */
/**
 * True from the first time the calculator is mostly on screen until the visitor touches it (or ~7 s pass):
 * CSS then pulses the next plan length once a beat, a nudge that these are buttons to try.
 */
function useTapHint() {
  const ref = useRef<HTMLElement>(null);
  const [hint, setHint] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    const stop = () => { setHint(false); io.disconnect(); clearTimeout(timer); };
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      setHint(true);
      timer = window.setTimeout(() => setHint(false), 7000);
    }, { threshold: 0.6 });
    io.observe(el);
    el.addEventListener("pointerdown", stop, { once: true });
    el.addEventListener("keydown", stop, { once: true });
    return () => { io.disconnect(); clearTimeout(timer); el.removeEventListener("pointerdown", stop); el.removeEventListener("keydown", stop); };
  }, []);
  return { ref, hint };
}

export function PriceMath({ plans, lengths, frequencies = [], bounds = { min: 3, max: 7 }, maxPct = 25 }: { plans: MathPlan[]; lengths: MathLength[]; frequencies?: MathFrequency[]; bounds?: { min: number; max: number }; maxPct?: number }) {
  const money = useFormatMoney();
  const [planKey, setPlanKey] = useState(plans[0]?.key ?? "");
  const plan = plans.find((p) => p.key === planKey) ?? plans[0];
  const [sizeId, setSizeId] = useState(plan?.sizes[0]?.id ?? "");
  const size = plan?.sizes.find((s) => s.id === sizeId) ?? plan?.sizes[0];
  const [eating, setEating] = useState<DayOfWeek[]>(() => (plans[0]?.sizes[0] ? fitDays([...MON_FRI], plans[0].sizes[0], bounds) : [...MON_FRI]));
  const [freqKey, setFreqKey] = useState("");
  // Opens on the first length that earns a discount (else the shortest): the useful comparison.
  const [weeks, setWeeks] = useState((lengths.find((l) => l.off > 0) ?? lengths[0])?.weeks ?? 4);
  const { ref, hint } = useTapHint();

  const length = lengths.find((l) => l.weeks === weeks) ?? lengths[0];
  const rate = size?.rate ?? 0;
  const open = (d: DayOfWeek) => !!size?.days.includes(d);
  const openCount = WEEK.filter((d) => open(d.key)).length;
  const max = Math.min(bounds.max, openCount);
  const min = Math.min(bounds.min, max);
  const fits = frequencies.filter((f) => f.days.every(open)).sort((a, b) => a.days.length - b.days.length);
  const freq = frequencies.find((f) => f.key === freqKey && fits.includes(f)) ?? [...fits].sort((a, b) => frequencies.indexOf(a) - frequencies.indexOf(b))[0];
  const saveFor = (f: MathFrequency) => Math.min(maxPct, f.off[length?.weeks ?? 0] ?? 0);

  const tiffins = eating.length * (length?.weeks ?? 0);
  const gross = round2(rate * tiffins);
  const lenOff = length?.off ?? 0;
  const delOff = freq?.off[length?.weeks ?? 0] ?? 0;
  const pct = Math.min(maxPct, lenOff + delOff);
  const off = round2(gross * pct / 100);
  const total = useTween(gross - off);

  if (!plan || !size || !length) return null;
  const pickSize = (p: MathPlan, id: string) => {
    const next = p.sizes.find((x) => x.id === id) ?? p.sizes[0];
    setPlanKey(p.key);
    setSizeId(next?.id ?? "");
    if (next) setEating((cur) => fitDays(cur, next, bounds));
  };
  const atMax = eating.length >= max, atMin = eating.length <= min;
  const toggle = (d: DayOfWeek) => {
    if (eating.includes(d)) { if (!atMin) setEating(eating.filter((x) => x !== d)); }
    else if (!atMax) setEating(WEEK.map((x) => x.key).filter((x) => x === d || eating.includes(x)));
  };
  const capped = lenOff + delOff > maxPct;
  const href = (() => {
    const q = new URLSearchParams({ p: plan.key, m: size.id });
    if (freq) q.set("f", freq.key);
    if (eating.join() !== MON_FRI.join()) q.set("d", eating.map((d) => WEEK.findIndex((x) => x.key === d) + 1).join(""));
    if (length.weeks !== 1) q.set("w", String(length.weeks));
    return `/subscribe?${q}`;
  })();

  return (
    <section ref={ref} id="estimate" className="lp-math" data-hint={hint || undefined} aria-labelledby="lp-math-title" onPointerDownCapture={consentMoment}>
      <div className="lp-math__controls">
        <h2 id="lp-math-title" className="lp-math__label">
          <Calculator aria-hidden className="size-4" strokeWidth={2.2} />Pricing calculator
          <span aria-hidden><Hand className="size-3.5" strokeWidth={2.2} />Tap to try</span>
        </h2>
        {plans.length > 1 ? (
          <div className="lp-math__row" role="radiogroup" aria-label="Diet">
            {plans.map((p) => (
              <button key={p.key} type="button" role="radio" aria-checked={p.key === plan.key} className="lp-math__chip" onClick={() => pickSize(p, p.sizes[0]?.id ?? "")}>{p.label}</button>
            ))}
          </div>
        ) : null}
        {/* Phones get the native picker (the OS wheel or sheet); desktop gets the app's own select, which
            shows each size's price in a styled list. CSS shows one of the two. */}
        <label className="lp-math__field lp-math__field--native">
          <span className="sr-only">Size</span>
          <select value={size.id} onChange={(e) => pickSize(plan, e.target.value)}>
            {plan.sizes.map((s) => <option key={s.id} value={s.id}>{s.name}, {money(s.rate)}</option>)}
          </select>
        </label>
        <div className="lp-math__field lp-math__field--picker">
          <Select value={size.id} onValueChange={(id) => pickSize(plan, id)}>
            <SelectTrigger aria-label="Size" className="lp-math__trigger"><SelectValue /></SelectTrigger>
            <SelectContent position="popper" side="bottom" sideOffset={6} avoidCollisions={false} className="lp-math__menu">
              {plan.sizes.map((s) => (
                <SelectItem key={s.id} value={s.id} className="lp-math__option">{s.name}, {money(s.rate)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <section className="lp-math__group" aria-labelledby="lp-math-eat">
          <h3 id="lp-math-eat" className="lp-math__h">Days you eat</h3>
          <div className="lp-math__row" role="group" aria-label="Days you would eat">
            {WEEK.map((d) => {
              const on = eating.includes(d.key), can = open(d.key);
              return (
                <button key={d.key} type="button" aria-pressed={on} disabled={!can} aria-disabled={!can || (on ? atMin : atMax) || undefined} data-closed={!can || undefined} className="lp-math__day" onClick={() => toggle(d.key)}>
                  {d.short}{!can ? <span className="sr-only"> (closed)</span> : null}
                </button>
              );
            })}
          </div>
          <p className="lp-math__count" aria-live="polite">
            <span><b className="tabular-nums">{eating.length}</b> {eating.length === 1 ? "tiffin" : "tiffins"} a week</span>
            <small>{min === max ? `${min} days` : `${min} to ${max} days`}</small>
          </p>
        </section>

        <section className="lp-math__group" aria-labelledby="lp-math-deliver">
          <h3 id="lp-math-deliver" className="lp-math__h">Deliveries</h3>
          {fits.length === 0 ? <p role="alert" className="lp-math__note">No delivery plan fits this meal’s days.</p> : null}
          <div className="lp-math__freqs" role="radiogroup" aria-label="Delivery frequency">
            {fits.map((f) => {
              const save = saveFor(f);
              // How this schedule brings the tiffins for the days picked: each delivery day and how many it carries.
              const trips = planWeek(f.days, eating);
              return (
                <button key={f.key} type="button" role="radio" aria-checked={f.key === freq?.key} aria-label={`${f.name}, ${f.days.length} ${f.days.length === 1 ? "delivery" : "deliveries"} a week${save > 0 ? `, save ${save}%` : ""}`} className="lp-math__freq" onClick={() => setFreqKey(f.key)}>
                  <span className="lp-math__freq-top">
                    <span><b className="tabular-nums">{f.days.length}×</b> a week</span>
                    {save > 0 ? <span className="lp-math__save">Save {save}%</span> : null}
                  </span>
                  {trips ? (
                    <span className="lp-math__trips" aria-label={trips.map((t) => `${WEEK.find((d) => d.key === t.day)?.short}: ${t.units} ${t.units === 1 ? "tiffin" : "tiffins"}`).join(", ")}>
                      {trips.map((t) => (
                        <span key={t.day} className="lp-math__trip" aria-hidden><small>{WEEK.find((d) => d.key === t.day)?.short}</small><b className="tabular-nums">{t.units}</b></span>
                      ))}
                    </span>
                  ) : <span className="lp-math__freq-days">Doesn’t fit your days</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="lp-math__group" aria-labelledby="lp-math-len">
          <h3 id="lp-math-len" className="lp-math__h">Weeks</h3>
          <div className="lp-math__row" role="radiogroup" aria-label="Plan length">
            {lengths.map((l) => (
              <button key={l.weeks} type="button" role="radio" aria-checked={l.weeks === length.weeks} aria-label={`${l.weeks} ${l.weeks === 1 ? "week" : "weeks"}${l.off > 0 ? `, ${l.off}% off` : ""}`} className="lp-math__chip lp-math__chip--wk" onClick={() => setWeeks(l.weeks)}>
                {l.weeks} wk{l.off > 0 ? <small>{l.off}%</small> : null}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* A till receipt: each term its own line, the total adds up underneath. Read aloud once per change, not per animation frame.
          The {" "} between flex items is invisible on screen; without it, search snippets read "Subtotal$186". */}
      <div className="lp-receipt">
        <p className="lp-receipt__head"><span>Estimate, before tax</span>{" "}<span>{plan.label}, {size.name}</span></p>
        <dl className="lp-receipt__lines">
          <div><dt>Per tiffin</dt>{" "}<dd>{money(rate)}</dd></div>
          <div><dt>Tiffins <small>{eating.length} {eating.length === 1 ? "day" : "days"} × {length.weeks} wk</small></dt>{" "}<dd>× {tiffins}</dd></div>
          {pct > 0 || lenOff > 0 || delOff > 0 ? (
            <>
              <div><dt>Subtotal</dt>{" "}<dd>{money(gross)}</dd></div>
              {lenOff > 0 ? <div className="lp-receipt__off"><dt>{length.weeks}-week discount <small>{lenOff}%</small></dt>{" "}<dd>−{money(round2(gross * lenOff / 100))}</dd></div> : null}
              {delOff > 0 ? <div className="lp-receipt__off"><dt>Delivery discount <small>{delOff}%</small></dt>{" "}<dd>−{money(round2(gross * delOff / 100))}</dd></div> : null}
              {capped ? <div><dt>Capped at <small>{maxPct}%</small></dt>{" "}<dd>+{money(round2(gross * (lenOff + delOff) / 100) - off)}</dd></div> : null}
            </>
          ) : null}
        </dl>
        <p className="lp-receipt__total"><span>Total <small>before tax</small></span>{" "}<strong className="tabular-nums">{money(total)}</strong></p>
      </div>
      <p className="sr-only" aria-live="polite">Estimated total {money(gross - off)}, before tax.</p>
      <div className="lp-math__foot">
        <small>Add-ons and coupons come in the plan builder.</small>
        <Link prefetch={false} href={href} className="lp-cta">Build this plan<ArrowRight aria-hidden className="size-4" strokeWidth={2.2} /></Link>
      </div>
    </section>
  );
}
