"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";

const AUTOPLAY_MS = 4000;
/** After a swipe, wait this long before moving again so the card the visitor chose stays put. */
const RESUME_AFTER_TOUCH_MS = 5000;

/** A row that becomes a swipe carousel on phones (CSS decides when). Dots under it say where
 *  you are and jump to a card. While the row actually scrolls sideways it also advances on its
 *  own, one pass only: it stops on the last card instead of wrapping (a wrap rewinds past every
 *  card at once). Paused by a touch (and a while after), hover or focus inside it, when off
 *  screen or in a hidden tab, and by the pause button (WCAG 2.2.2). Reduced-motion visitors
 *  start paused. Pressing play on the last card starts a new pass from the first. */
export function SwipeRow({ className, label, names, children }: { className: string; label: string; names: string[]; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const hold = useRef({ hover: false, focus: false, touch: false, offscreen: true });
  const count = Children.toArray(children).length;

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
  }, []);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    // The active dot is the card nearest the row's snap edge: one value, so one dot.
    const onScroll = () => {
      const left = el.scrollLeft;
      let best = 0;
      [...el.children].forEach((c, i) => {
        const d = Math.abs((c as HTMLElement).offsetLeft - el.offsetLeft - parseFloat(getComputedStyle(el).scrollPaddingLeft || "0") - left);
        const bd = Math.abs((el.children[best] as HTMLElement).offsetLeft - el.offsetLeft - parseFloat(getComputedStyle(el).scrollPaddingLeft || "0") - left);
        if (d < bd) best = i;
      });
      setIndex(best);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const seen = new IntersectionObserver(([e]) => { hold.current.offscreen = !e?.isIntersecting; }, { threshold: 0.4 });
    if (wrap.current) seen.observe(wrap.current);
    return () => { el.removeEventListener("scroll", onScroll); seen.disconnect(); };
  }, [count]);

  const go = (i: number) => {
    const el = row.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: card.offsetLeft - el.offsetLeft - parseFloat(getComputedStyle(el).scrollPaddingLeft || "0"), behavior: smooth ? "smooth" : "auto" });
  };

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const el = row.current;
      const h = hold.current;
      // Desktop lays the cards out in a grid: nothing to scroll, nothing to play.
      if (!el || el.scrollWidth <= el.clientWidth + 4) return;
      if (h.hover || h.focus || h.touch || h.offscreen || document.hidden) return;
      if (index >= count - 1) { setPlaying(false); return; }
      go(index + 1);
    }, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [playing, index, count]);

  return (
    <div
      ref={wrap}
      onMouseEnter={() => { hold.current.hover = true; }}
      onMouseLeave={() => { hold.current.hover = false; }}
      onTouchStart={() => { hold.current.touch = true; }}
      onTouchEnd={() => { setTimeout(() => { hold.current.touch = false; }, RESUME_AFTER_TOUCH_MS); }}
      onFocus={() => { hold.current.focus = true; }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) hold.current.focus = false; }}
    >
      <div ref={row} className={className}>{children}</div>
      <div className="lp-swipe-nav">
        <div className="lp-swipe-dots" role="group" aria-label={label}>
          {Array.from({ length: count }, (_, i) => (
            <button key={i} type="button" aria-label={`Card ${i + 1} of ${count}: ${names[i] ?? ""}`} aria-current={i === index} onClick={() => go(i)} />
          ))}
        </div>
        <button type="button" className="lp-swipe-play" aria-label={playing ? "Pause cards" : "Play cards"} onClick={() => { if (!playing && index >= count - 1) go(0); setPlaying((v) => !v); }}>
          {playing ? <Pause aria-hidden className="size-4" strokeWidth={2.2} /> : <Play aria-hidden className="size-4" strokeWidth={2.2} />}
        </button>
      </div>
    </div>
  );
}
