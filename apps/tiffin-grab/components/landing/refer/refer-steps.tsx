"use client";

import { useEffect, useRef, useState } from "react";
import { LazyReferDemo } from "@/components/landing/stage/lazy";

export type ReferStep = { title: string; body: string };

/**
 * The three steps beside the phone, driven by scroll: the section is a tall track with a pinned panel,
 * and three markers down the track pick the step, which sets the demo's screen. Under reduced motion
 * (or before the observer runs) it is a plain list and the demo plays on its own.
 */
export function ReferSteps({ steps, demo }: { steps: ReferStep[]; demo: { gift: string | null; earn: string; coins: number } | null }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<0 | 1 | 2 | null>(null);
  useEffect(() => {
    const box = track.current;
    if (!box || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setActive(0);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.at) as 0 | 1 | 2);
    }, { rootMargin: "-50% 0px -50% 0px" });
    box.querySelectorAll("[data-at]").forEach((m) => io.observe(m));
    return () => io.disconnect();
  }, []);
  const driven = active != null;
  return (
    <div ref={track} className="rf3-steps__track" data-driven={driven || undefined} data-demo={demo ? "" : undefined}>
      {steps.map((_, i) => <span key={i} className="rf3-steps__marker" data-at={i} aria-hidden />)}
      <div className="rf3-steps__pin">
        <div className="rf3-steps__side">
          <h2 id="rf3-steps-title" className="lp-h2 rf3-steps__h">Three steps, one link.</h2>
          <ol className="rf3-steps__list">
            {steps.map((s, i) => (
              <li key={s.title} className="rf3-step" aria-current={active === i ? "step" : undefined}>
                <span className="rf3-step__n" aria-hidden>{i + 1}</span>
                <strong>{s.title}</strong>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
        {demo ? (
          <div className="rf3-steps__demo">
            <LazyReferDemo gift={demo.gift} earn={demo.earn} coins={demo.coins} step={driven ? active : undefined} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
