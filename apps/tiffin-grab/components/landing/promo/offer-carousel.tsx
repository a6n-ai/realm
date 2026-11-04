"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { CopyCode, PromoHtml } from "@/components/landing/promo-popup";
import type { LandingPromo } from "@/lib/landing/promo-types";
import "./promo.css";

/** One promotion as a die-cut coupon (main + tear-off code stub) beside its photo tile. */
export function CouponSlide({ promo, photo }: { promo: LandingPromo; photo?: StaticImageData | null }) {
  return (
    <>
      <article className="lp-coupon" aria-label={promo.title}>
        <div className="lp-coupon__main">
          {/* Staff HTML is the whole card text; without it the fields draw the card. */}
          {promo.html ? <PromoHtml html={promo.html} title={promo.title} /> : (
            <>
              <strong className="lp-coupon__badge">{promo.badge || promo.title}</strong>
              {promo.badge ? <span className="lp-coupon__title">{promo.title}</span> : null}
              {promo.blurb ? <p className="lp-coupon__blurb">{promo.blurb}</p> : null}
            </>
          )}
          <div><Link prefetch={false} href={promo.href} className="tg-promo-cta tg-promo-cta--ink">{promo.cta}</Link></div>
        </div>
        <div className="lp-coupon__stub">
          {promo.code ? (
            <>
              <span className="lp-coupon__label">Use code</span>
              <CopyCode code={promo.code} />
            </>
          ) : <span className="lp-coupon__label">No code needed</span>}
        </div>
      </article>
      <div className={promo.imageUrl ? "lp-offers__photo lp-offers__photo--own" : "lp-offers__photo"}>
        {promo.imageUrl && /^\/landing\/[^?]*$/.test(promo.imageUrl) ? (
          // Same-origin file: let the optimizer serve WebP/AVIF at the tile's width.
          <Image src={promo.imageUrl} alt="" fill sizes="(max-width: 900px) 100vw, 740px" />
        ) : promo.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- staff-supplied URL from any host
          <img src={promo.imageUrl} alt="" loading="lazy" />
        ) : photo ? (
          <Image src={photo} alt="Paneer butter masala in a copper pan" placeholder="blur" sizes="(max-width: 900px) 100vw, 400px" />
        ) : null}
      </div>
    </>
  );
}

/** Running promotions as a swipeable row. Scroll-snap does the moving; the arrows and dots
 *  only scroll the track, so touch, trackpad and keyboard all behave natively. */
const AUTOPLAY_MS = 6000;

/** Running promotions as a swipeable row. Scroll-snap does the moving; the arrows and dots
 *  only scroll the track, so touch, trackpad and keyboard all behave natively. Autoplay
 *  stops while hovered, focused, off-screen or in a hidden tab, and has a pause button
 *  (WCAG 2.2.2); reduced-motion visitors start paused. */
export function OfferCarousel({ promos, photo, label = "Offers" }: { promos: LandingPromo[]; photo?: StaticImageData | null; label?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const hold = useRef({ hover: false, focus: false, offscreen: true });
  const many = promos.length > 1;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el || !many) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setIndex(Number((e.target as HTMLElement).dataset.i));
      },
      { root: el, threshold: 0.6 },
    );
    for (const slide of el.children) io.observe(slide);
    const seen = new IntersectionObserver(([e]) => { hold.current.offscreen = !e?.isIntersecting; }, { threshold: 0.3 });
    if (root.current) seen.observe(root.current);
    return () => { io.disconnect(); seen.disconnect(); };
  }, [many]);

  const go = (i: number) => {
    const el = track.current;
    const slide = el?.children[i] as HTMLElement | undefined;
    if (!el || !slide) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: slide.offsetLeft - el.offsetLeft, behavior: smooth ? "smooth" : "auto" });
  };

  useEffect(() => {
    if (!playing || !many) return;
    const t = setInterval(() => {
      const h = hold.current;
      if (h.hover || h.focus || h.offscreen || document.hidden) return;
      go((index + 1) % promos.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [playing, many, index, promos.length]);

  return (
    <div
      ref={root}
      className="lp-offers__carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => { hold.current.hover = true; }}
      onMouseLeave={() => { hold.current.hover = false; }}
      onFocus={() => { hold.current.focus = true; }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) hold.current.focus = false; }}
    >
      <div ref={track} className="lp-offers__track" aria-live={playing ? "off" : "polite"}>
        {promos.map((p, i) => (
          <div key={p.id} className="lp-offers__slide" data-i={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${promos.length}`}>
            <CouponSlide promo={p} photo={photo} />
          </div>
        ))}
      </div>
      {many ? (
        <div className="lp-offers__nav">
          <div className="lp-offers__dots">
            {promos.map((p, i) => (
              <button key={p.id} type="button" className="lp-offers__dot" aria-label={`Show offer ${i + 1}: ${p.title}`} aria-current={i === index} onClick={() => go(i)} />
            ))}
          </div>
          <div className="lp-offers__arrows">
            <button type="button" className="lp-offers__arrow lp-offers__arrow--play" aria-label={playing ? "Pause offers" : "Play offers"} onClick={() => setPlaying((v) => !v)}>
              {playing ? <Pause aria-hidden className="size-4" strokeWidth={2.2} /> : <Play aria-hidden className="size-4" strokeWidth={2.2} />}
            </button>
            <button type="button" className="lp-offers__arrow lp-offers__arrow--step" aria-label="Previous offer" disabled={index === 0} onClick={() => go(index - 1)}>
              <ChevronLeft aria-hidden className="size-5" strokeWidth={2} />
            </button>
            <button type="button" className="lp-offers__arrow lp-offers__arrow--step" aria-label="Next offer" disabled={index === promos.length - 1} onClick={() => go(index + 1)}>
              <ChevronRight aria-hidden className="size-5" strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
