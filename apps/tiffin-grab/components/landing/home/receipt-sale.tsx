"use client";

import Link from "next/link";
import { Caveat, Space_Mono } from "next/font/google";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarClock, Printer } from "lucide-react";
import { useFormatMoney } from "@/components/app-currency";
import { CopyCode } from "@/components/landing/promo-popup";
import type { LandingPromo } from "@/lib/landing/promo-types";

const till = Space_Mono({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-till", display: "swap" });
const pen = Caveat({ weight: ["600", "700"], subsets: ["latin"], variable: "--font-pen", display: "swap" });

// Deterministic bar widths for the barcode (no Math.random, so server and client agree).
const BARS = [3, 1, 2, 1, 1, 3, 2, 1, 3, 1, 1, 2, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 1];

/** Time left to the real end as day / hour / minute tiles, refreshed each minute. Before mount it
 *  shows only the fixed date, so the server render and the first client render match. */
function Countdown({ endsAt, label }: { endsAt: number | null; label: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const live = endsAt != null && now != null && endsAt > now;
  const mins = live ? Math.floor((endsAt - now) / 60_000) : 0;
  const units = [["days", Math.floor(mins / 1440)], ["hrs", Math.floor((mins % 1440) / 60)], ["min", mins % 60]] as const;
  return (
    <div className="lp-till__clock" role="timer" aria-label={live ? `${units[0][1]} days ${units[1][1]} hours ${units[2][1]} minutes left. ${label}` : label}>
      {live ? units.map(([u, v]) => (
        <span key={u} className="lp-till__tile"><b>{String(v).padStart(2, "0")}</b><small>{u}</small></span>
      )) : null}
      <span className="lp-till__clock-end"><CalendarClock aria-hidden className="size-4" strokeWidth={2} />{label}</span>
    </div>
  );
}

/**
 * Black Friday as a special TiffinGrab prints for the visitor: a thermal till receipt feeds out of
 * the slot line by line, then a saffron pen marks it up (strikes the old total, circles the new
 * one, writes the saving). Every figure is the best receipt from checkout's own pricing. Printing
 * starts once the section is in view; reduced motion shows the marked-up receipt straight away.
 */
export function ReceiptSale({ promo }: { promo: LandingPromo }) {
  const usd = useFormatMoney();
  const best = promo.savings!.best!;
  const lines = promo.savings!.perks;
  const pay = best.subtotal - best.total;
  const [meal, ...plan] = best.example.split(", ");
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"idle" | "printing" | "done">("idle");
  const [run, setRun] = useState(0);
  const [today, setToday] = useState("");


  useEffect(() => {
    setToday(new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(Date.now()));
  }, []);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setState("done"); return; }
    const el = ref.current;
    if (!el) return;
    setState("idle");
    let t = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      // Two frames so the idle state paints before the feed starts (a re-print restarts from the slot).
      requestAnimationFrame(() => requestAnimationFrame(() => setState("printing")));
      t = window.setTimeout(() => setState("done"), 2300);
    }, { threshold: 0.35 });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(t); };
  }, [run]);

  return (
    <section ref={ref} className={`lp-till ${till.variable} ${pen.variable}`} aria-labelledby="lp-offer" data-state={state}>
      <div className="lp-wrap lp-till__grid">
        <div className="lp-till__copy">
          <p className="lp-till__name">{promo.title}</p>
          <h2 id="lp-offer" className="lp-till__h">
            We printed you a Black Friday{" "}
            <span className="lp-till__mark">
              special.
              <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden><path d="M4 14 C 50 6, 120 18, 196 7" /></svg>
            </span>
          </h2>
          {/* One sticker per discount, slapped on as its line prints on the receipt. */}
          <ul className="lp-till__stickers">
            {lines.map((l, i) => (
              <li key={l.label} className={`lp-till__sticker lp-till__sticker--${i}`} style={{ ["--i" as string]: i }}>
                <strong>{l.figure}</strong>
                <span>off</span>
                <small>{l.short}</small>
              </li>
            ))}
          </ul>
          <p className="lp-till__p">
            {promo.minSpend ? `Works on every plan over ${promo.minSpend}, not just one meal.` : "Works on every plan, not just one meal."}{" "}
            The receipt shows our biggest, the {meal}, {plan.slice(1).join(", ")} for {plan[0]}, so you see the most it can save.
          </p>
          <div className="lp-till__actions">
            <Link prefetch={false} href={promo.href} className="tg-promo-cta lp-till__cta">{promo.cta}<ArrowRight aria-hidden className="size-4" strokeWidth={2.2} /></Link>
            {promo.code ? <CopyCode code={promo.code} /> : null}
          </div>
          {promo.endsLabel ? <Countdown endsAt={promo.endsAt ?? null} label={promo.endsLabel} /> : null}
          <p className="lp-till__psst"><span aria-hidden>psst… </span>ask our staff for your own special discount</p>
        </div>

        <div className="lp-till__stage">
          <div className="lp-till__printer" aria-hidden>
            <span className="lp-till__brand">TiffinGrab</span>
            <span className="lp-till__led" />
          </div>
          <div className="lp-till__feed">
            <div className="lp-till__roll">
            <article className="lp-till__paper" aria-label={`Black Friday special: ${best.example}, you pay ${usd(pay)}, you save ${usd(best.total)}`}>
              <header className="lp-till__head">
                <strong>TIFFINGRAB</strong>
                <span>Home-style tiffins · GTA</span>
                <span className="lp-till__rule" aria-hidden>{"*".repeat(32)}</span>
                <b>BLACK FRIDAY SPECIAL</b>
                <span>Printed for you{today ? ` · ${today}` : ""}</span>
              </header>
              <dl className="lp-till__items">
                <div><dt>{meal}</dt><dd /></div>
                <div className="lp-till__sub"><dt>{plan.join(" · ")}</dt><dd /></div>
                <div><dt>{best.subtotalLabel}</dt><dd className="lp-till__old">{usd(best.subtotal)}<svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden><path d="M2 14 C 30 6, 64 12, 98 5" /></svg></dd></div>
                {lines.map((l) => (
                  <div key={l.label} className="lp-till__off"><dt>{l.label}</dt><dd>−{usd(l.amount)}</dd></div>
                ))}
              </dl>
              <p className="lp-till__total">
                <span>TOTAL</span>
                <strong>
                  {usd(pay)}
                  <svg className="lp-till__ring" viewBox="0 0 160 70" preserveAspectRatio="none" aria-hidden>
                    <path d="M120 8 C 150 14, 158 44, 126 58 C 92 70, 30 66, 12 46 C -4 28, 30 6, 82 6 C 104 6, 118 10, 128 16" />
                  </svg>
                  <span className="lp-till__note" aria-hidden>you save {usd(best.total)}!</span>
                </strong>
              </p>
              <p className="lp-till__fine">Before tax. {promo.endsLabel ? `${promo.endsLabel.replace("Ends", "Valid until")}.` : ""}{promo.code ? ` Code ${promo.code} at checkout.` : ""}</p>
              <span className="lp-till__bars" aria-hidden>{BARS.map((w, i) => <i key={i} style={{ width: w * 2 }} />)}</span>
              <p className="lp-till__thanks">THANK YOU · EAT WELL</p>

            </article>
            </div>
          </div>
          {/* Always laid out, so the column does not shift when printing ends. */}
          <button type="button" className="lp-till__again" disabled={state !== "done"} data-shown={state === "done" || undefined} onClick={() => setRun((r) => r + 1)}>
            <Printer aria-hidden className="size-4" strokeWidth={2} />Print it again
          </button>
        </div>
      </div>
    </section>
  );
}
