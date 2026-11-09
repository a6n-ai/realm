"use client";

import { useFormatMoney } from "@/components/app-currency";
import { useEffect, useRef, useState } from "react";
import type { PromoSavings } from "@/lib/landing/promo-types";
import { round2 } from "@foundry/commons/util/money";

const COUNT_MS = 900;

/** A glass checkout receipt for one real plan: lines drop in once it is in view, then the
 *  saving counts up to its total. Reduced motion shows the finished receipt straight away. */
export function SavingsReceipt({ savings, className }: { savings: PromoSavings; className?: string }) {
  const usd = useFormatMoney();
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [total, setTotal] = useState(savings.total);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(true); return; }
    setTotal(0);
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      setShown(true);
      // Count starts as the last line lands, so the total reads as their sum.
      const start = performance.now() + 120 * savings.lines.length + 200;
      const tick = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - start) / COUNT_MS));
        setTotal(round2(savings.total * (1 - (1 - t) ** 3)));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [savings.total, savings.lines.length]);

  return (
    <div ref={ref} className={`tg-receipt${shown ? " is-shown" : ""}${className ? ` ${className}` : ""}`}>
      <p className="tg-receipt__head">
        <span>Example plan</span>
        <span>{savings.example}</span>
      </p>
      <dl className="tg-receipt__lines">
        <div className="tg-receipt__line">
          <dt>{savings.subtotalLabel}</dt>
          <dd>{usd(savings.subtotal)}</dd>
        </div>
        {savings.lines.map((l, i) => (
          <div key={l.label} className="tg-receipt__line tg-receipt__line--off" style={{ transitionDelay: `${120 * (i + 1)}ms` }}>
            <dt>{l.label}</dt>
            <dd>−{usd(l.amount)}</dd>
          </div>
        ))}
      </dl>
      <p className="tg-receipt__total">
        <span>You save</span>
        {/* The live counter is visual only; the real figure is what assistive tech reads. */}
        <strong aria-hidden>{usd(total)}</strong>
        <span className="sr-only">{usd(savings.total)}</span>
      </p>
      <p className="tg-receipt__note">
        {savings.upTo ? `Up to ${usd(savings.upTo)} on longer plans. ` : ""}Before tax, prices as of today.
      </p>
    </div>
  );
}
