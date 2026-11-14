"use client";

import { useEffect, useRef, useState } from "react";
import { apexServes } from "@/lib/routing/apex";
import { BrandWordmark } from "@/components/brand-logo";
import { apexOf, clearSplashFlag, raiseSplashFlag } from "@/lib/splash/handoff";
import { startOrb } from "@/lib/splash/orb";

// The site is two hosts: public pages on tiffingrab.ca, the app on app.tiffingrab.ca, and inside one
// host the public and app areas ship separate CSS builds, so moving between them is a full page load.
// Until the next page paints the browser shows a blank (on iOS, a white blur). The splash covers the
// whole load: the page being left raises it and sets a short-lived flag, and the page being opened
// keeps it up from its first paint (the <head> script in lib/splash/handoff.ts) until it is ready.

/** Dispatch to raise the splash before a full-page navigation this component cannot see (a script
 *  calling location.assign). Links are caught on their own. */
export const SPLASH_EVENT = "tg:splash";
export const showSplash = () => dispatchEvent(new Event(SPLASH_EVENT));

/** Whether following `a` leaves this host (directly, or via the apex's 302 to app.). */
export function leavesHost(a: HTMLAnchorElement, here: URL): boolean {
  if (a.target && a.target !== "_self") return false;
  if (a.hasAttribute("download")) return false;
  const to = new URL(a.href, here);
  const apex = apexOf(here.hostname);
  if (!apex || !/^https?:$/.test(to.protocol)) return false;
  if (to.origin !== here.origin) return to.hostname === apex || to.hostname.endsWith(`.${apex}`);
  // Same origin on the apex: anything it doesn't serve is redirected to app.
  return here.hostname === apex && !apexServes(to.pathname);
}

type Phase = false | "leave" | "arrive";
const FADE_MS = 320;

export function CrossHostSplash() {
  const [phase, setPhase] = useState<Phase>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null), wordRef = useRef<HTMLSpanElement>(null);
  const baseRef = useRef<HTMLDivElement>(null), silkRef = useRef<HTMLDivElement>(null), rootRef = useRef<HTMLDivElement>(null);

  // the page being opened: the <head> script already showed the splash on its first paint
  useEffect(() => {
    if (document.documentElement.dataset.splash === "arrive") setPhase("arrive");
  }, []);

  // the page being left: raise it on any tap that will load another page
  useEffect(() => {
    const raise = () => {
      raiseSplashFlag();
      document.documentElement.dataset.splash = "leave";
      setPhase("leave");
    };
    const onClick = (e: MouseEvent) => {
      // No defaultPrevented check: next/link cancels the native click to route itself, and a
      // link the apex 302s to app. still ends in a full load.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (a instanceof HTMLAnchorElement && leavesHost(a, new URL(location.href))) raise();
    };
    // a bfcache restore brings the old page back with the splash up: take it down
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && document.documentElement.dataset.splash) { delete document.documentElement.dataset.splash; setPhase(false); }
    };
    addEventListener("click", onClick);
    addEventListener(SPLASH_EVENT, raise);
    addEventListener("pageshow", onShow);
    return () => { removeEventListener("click", onClick); removeEventListener(SPLASH_EVENT, raise); removeEventListener("pageshow", onShow); };
  }, []);

  // while it shows: run the orb and the shader background; take it down when the page is ready
  useEffect(() => {
    if (!phase || !canvasRef.current || !wordRef.current) return;
    const html = document.documentElement, reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stopOrb = startOrb(canvasRef.current, wordRef.current, reduce);
    let alive = true, disposeBg: (() => void) | undefined;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const hide = () => {
      html.dataset.splash = "out";
      timers.push(setTimeout(() => { if (html.dataset.splash === "out") delete html.dataset.splash; if (alive) setPhase(false); }, FADE_MS));
    };
    if (baseRef.current && silkRef.current) {
      import("@/lib/splash/background")
        .then(({ mountSplashBackground }) => mountSplashBackground(baseRef.current!, silkRef.current!, html.classList.contains("dark"), reduce))
        .then((d) => { if (alive) { disposeBg = d; rootRef.current?.setAttribute("data-shader", ""); } else d(); })
        .catch(() => { /* no WebGL: the CSS aurora stays */ });
    }
    if (phase === "leave") timers.push(setTimeout(hide, 10_000)); // an aborted load (download, stop) must not leave it up
    if (phase === "arrive") {
      clearSplashFlag();
      // let the page's first content paint under it, then fade; never longer than a few seconds
      const ready = () => timers.push(setTimeout(hide, 300));
      if (document.readyState === "complete") ready(); else addEventListener("load", ready, { once: true });
      timers.push(setTimeout(hide, 5000));
    }
    return () => { alive = false; stopOrb(); disposeBg?.(); timers.forEach(clearTimeout); rootRef.current?.removeAttribute("data-shader"); };
  }, [phase]);

  return (
    <div ref={rootRef} className="tg-splash" role="status" aria-live="polite" aria-label={phase ? "Loading TiffinGrab" : undefined} aria-hidden={!phase}>
      <div className="tg-splash__aurora" aria-hidden><i /><i /><i /><i /><i /></div>
      <div className="tg-splash__shader" aria-hidden><div ref={baseRef} /><div ref={silkRef} className="tg-splash__silk" /></div>
      <div className="tg-splash__orb" aria-hidden>
        <canvas ref={canvasRef} />
        <span ref={wordRef} className="tg-splash__step" />
      </div>
      <div className="tg-splash__brand" aria-hidden>
        {/* a plain img: the mark must be there on the first paint, before any script runs */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark.svg" alt="" width={34} height={34} className="tg-splash__mark" />
        <BrandWordmark className="tg-splash__word" />
      </div>
    </div>
  );
}
