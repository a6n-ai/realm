"use client";

import { useEffect, useRef, useState } from "react";
import { startOrb } from "@/lib/splash/orb";

// The customer app's loading screen: the splash's thinking orb, small and plain (it only turns, no
// icons or words), on the page's own background. It sits in each /me route's loading.tsx, so it stays until the page
// has streamed in; OrbNavOverlay covers the moment before that boundary appears.

function OrbBody() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    return startOrb(canvas.current, null, matchMedia("(prefers-reduced-motion: reduce)").matches, { morph: false, dots: 220 });
  }, []);
  return (
    <div className="tg-orbload__orb">
      <canvas ref={canvas} />
    </div>
  );
}

/** Full-height orb, for a route's loading.tsx. */
export function OrbLoading() {
  return (
    <div className="tg-orbload" role="status" aria-live="polite" aria-label="Loading">
      <OrbBody />
    </div>
  );
}

/** Covers an in-app navigation that is still waiting on the server (NavPending marks it data-nav="orb").
 *  It only appears after a short delay (CSS), so a quick navigation never flashes it. */
export function OrbNavOverlay() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const html = document.documentElement, sync = () => setOn(html.dataset.nav === "orb");
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(html, { attributes: true, attributeFilter: ["data-nav"] });
    return () => mo.disconnect();
  }, []);
  if (!on) return null;
  return (
    <div className="tg-orbload tg-orbload--overlay" role="status" aria-live="polite" aria-label="Loading">
      <OrbBody />
    </div>
  );
}
