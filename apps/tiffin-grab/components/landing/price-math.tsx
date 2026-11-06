"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Calculator, Hand } from "lucide-react";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { consentMoment } from "@/components/consent/cookie-consent";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";

export type MathSize = { id: string; name: string; rate: number; days: DayOfWeek[] };
export type MathPlan = { key: string; label: string; sizes: MathSize[] };
export type MathLength = { weeks: number; off: number };
export type MathFrequency = { id: string; name: string; days: DayOfWeek[] };

const WEEK: { key: DayOfWeek; short: string }[] = [
  { key: "mon", short: "Mon" }, { key: "tue", short: "Tue" }, { key: "wed", short: "Wed" }, { key: "thu", short: "Thu" },
  { key: "fri", short: "Fri" }, { key: "sat", short: "Sat" }, { key: "sun", short: "Sun" },
];
const money = (n: number) => `$${n.toFixed(2)}`;
const SHORT: Record<DayOfWeek, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
// A frequency's button label, short enough to keep the row on one line; its full name stays the accessible name.
function freqLabel(days: DayOfWeek[]): string {
  const set = new Set(days);
  if (days.length === 5 && ["mon", "tue", "wed", "thu", "fri"].every((d) => set.has(d as DayOfWeek))) return "Weekdays";
  if (days.length === 7) return "Every day";
  if (days.length <= 3) return WEEK.filter((d) => set.has(d.key)).map((d) => SHORT[d.key]).join(" ");
  return `${days.length} days`;
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

export function PriceMath({ plans, lengths, frequencies = [] }: { plans: MathPlan[]; lengths: MathLength[]; frequencies?: MathFrequency[] }) {
  const [planKey, setPlanKey] = useState(plans[0]?.key ?? "");
  const plan = plans.find((p) => p.key === planKey) ?? plans[0];
  const [sizeId, setSizeId] = useState(plan?.sizes[0]?.id ?? "");
  const size = plan?.sizes.find((s) => s.id === sizeId) ?? plan?.sizes[0];
  // Starts on every day the size delivers ("All days"); a frequency or single days narrow it.
  const ALL = WEEK.map((d) => d.key);
  const [days, setDays] = useState<DayOfWeek[]>(ALL);
  // Opens on the first length that earns a discount (else the shortest): the useful comparison.
  const [weeks, setWeeks] = useState((lengths.find((l) => l.off > 0) ?? lengths[0])?.weeks ?? 4);

  const allowed = new Set(size?.days ?? []);
  const picked = days.filter((d) => allowed.has(d));
  const length = lengths.find((l) => l.weeks === weeks) ?? lengths[0];
  const rate = size?.rate ?? 0;
  const gross = rate * picked.length * (length?.weeks ?? 0);
  const off = gross * ((length?.off ?? 0) / 100);
  const total = useTween(gross - off);
  const { ref, hint } = useTapHint();

  if (!plan || !size || !length) return null;
  const toggle = (d: DayOfWeek) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

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
              <button key={p.key} type="button" role="radio" aria-checked={p.key === plan.key} className="lp-math__chip" onClick={() => { setPlanKey(p.key); setSizeId(p.sizes[0]?.id ?? ""); }}>{p.label}</button>
            ))}
          </div>
        ) : null}
        {/* Phones get the native picker (the OS wheel or sheet); desktop gets the app's own select, which
            shows each size's price in a styled list. CSS shows one of the two. */}
        <label className="lp-math__field lp-math__field--native">
          <span className="sr-only">Size</span>
          <select value={size.id} onChange={(e) => setSizeId(e.target.value)}>
            {plan.sizes.map((s) => <option key={s.id} value={s.id}>{s.name} · {money(s.rate)}</option>)}
          </select>
        </label>
        <div className="lp-math__field lp-math__field--picker">
          <Select value={size.id} onValueChange={setSizeId}>
            <SelectTrigger aria-label="Size" className="lp-math__trigger"><SelectValue /></SelectTrigger>
            <SelectContent position="popper" side="bottom" sideOffset={6} avoidCollisions={false} className="lp-math__menu">
              {plan.sizes.map((s) => (
                <SelectItem key={s.id} value={s.id} className="lp-math__option">{s.name} · {money(s.rate)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="lp-math__row" role="radiogroup" aria-label="Delivery frequency">
          {[{ id: "all", name: "Every day it delivers", days: ALL, label: "All days" }, ...frequencies.map((f) => ({ ...f, label: freqLabel(f.days) }))].map((f) => {
            // One choice lights at a time: "All days" when every deliverable day is picked, else the matching frequency.
            const want = f.days.filter((d) => allowed.has(d));
            const same = want.length === picked.length && want.every((d) => picked.includes(d));
            const on = f.id === "all" ? picked.length === allowed.size : same && picked.length !== allowed.size;
            return <button key={f.id} type="button" role="radio" aria-checked={on} aria-label={f.name} title={f.name} className="lp-math__chip" onClick={() => setDays(f.days)}>{f.label}</button>;
          })}
        </div>
        <div className="lp-math__row" role="group" aria-label="Days you would eat">
          {WEEK.map((d) => {
            const can = allowed.has(d.key);
            return (
              <button key={d.key} type="button" aria-pressed={can && days.includes(d.key)} disabled={!can} className="lp-math__day" onClick={() => toggle(d.key)}>{d.short}</button>
            );
          })}
        </div>
        <div className="lp-math__row" role="radiogroup" aria-label="Plan length">
          {lengths.map((l) => (
            <button key={l.weeks} type="button" role="radio" aria-checked={l.weeks === length.weeks} aria-label={`${l.weeks} ${l.weeks === 1 ? "week" : "weeks"}${l.off > 0 ? `, ${l.off}% off` : ""}`} className="lp-math__chip lp-math__chip--wk" onClick={() => setWeeks(l.weeks)}>
              {l.weeks} wk{l.off > 0 ? <small>{l.off}%</small> : null}
            </button>
          ))}
        </div>
      </div>

      {/* A till receipt: each term its own line, the total adds up underneath. Read aloud once per change, not per animation frame. */}
      <div className="lp-receipt">
        <p className="lp-receipt__head"><span>Estimate, before tax</span><span>{plan.label} · {size.name}</span></p>
        <dl className="lp-receipt__lines">
          <div><dt>Per tiffin</dt><dd>{money(rate)}</dd></div>
          <div><dt>Tiffins <small>{picked.length} {picked.length === 1 ? "day" : "days"} × {length.weeks} wk</small></dt><dd>× {picked.length * length.weeks}</dd></div>
          {length.off > 0 ? (
            <>
              <div><dt>Subtotal</dt><dd>{money(gross)}</dd></div>
              <div className="lp-receipt__off"><dt>{length.weeks}-week discount <small>{length.off}%</small></dt><dd>−{money(off)}</dd></div>
            </>
          ) : null}
        </dl>
        <p className="lp-receipt__total"><span>Total <small>before tax</small></span><strong className="tabular-nums">{money(total)}</strong></p>
      </div>
      <p className="sr-only" aria-live="polite">Estimated total {money(gross - off)}, before tax.</p>
      <div className="lp-math__foot">
        <small>Add-ons and coupons come in the plan builder.</small>
        <Link prefetch={false} href={`/subscribe?plan=${plan.key}`} className="lp-cta">Build this plan<ArrowRight aria-hidden className="size-4" strokeWidth={2.2} /></Link>
      </div>
    </section>
  );
}
