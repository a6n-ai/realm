"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { apexServes } from "@/lib/routing/apex";
import { BrandWordmark } from "@/components/brand-logo";

// The site is two hosts: public pages on tiffingrab.ca, the app on app.tiffingrab.ca. A tap
// between them is a full page load, and until the next page paints the browser shows a blank
// (on iOS, a white blur). The splash covers that gap with the brand mark. The browser keeps
// painting the old page, splash included, until the new page has content to show.

function apexOf(hostname: string): string | null {
  if (hostname === "localhost" || /^[\d.]+$/.test(hostname)) return null;
  return hostname.startsWith("app.") ? hostname.slice(4) : hostname.replace(/^www\./, "");
}

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

export function CrossHostSplash() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // No defaultPrevented check: next/link cancels the native click to route itself, and a
      // link the apex 302s to app. still ends in a full load.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (a instanceof HTMLAnchorElement && leavesHost(a, new URL(location.href))) setOn(true);
    };
    // A bfcache restore brings the page back with the splash still up; an aborted load
    // (download, stop) would leave it up forever.
    const off = () => setOn(false);
    addEventListener("click", onClick);
    addEventListener("pageshow", off);
    return () => { removeEventListener("click", onClick); removeEventListener("pageshow", off); };
  }, []);

  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setOn(false), 10_000);
    return () => clearTimeout(t);
  }, [on]);

  if (!on) return null;
  // A dabba being packed: four tiers land one on another, the lid settles, the clamp closes,
  // and steam keeps rising until the next page paints over it. Its shadow grows per tier.
  return (
    <div className="tg-splash" role="status" aria-live="polite">
      <svg className="tg-splash__tiffin" viewBox="0 0 120 160" width={120} height={160} aria-hidden>
        <g className="tg-splash__steam" fill="none" strokeLinecap="round" strokeWidth={3}>
          <path d="M48 30c-5-6 5-10 0-17" />
          <path d="M60 26c-5-6 5-10 0-17" />
          <path d="M72 30c-5-6 5-10 0-17" />
        </g>
        <ellipse className="tg-splash__shadow" cx={60} cy={150} rx={44} ry={5} />
        {[0, 1, 2, 3].map((i) => (
          <g key={i} className="tg-splash__tier" style={{ "--i": i } as CSSProperties}>
            <rect x={26} y={120 - i * 23} width={68} height={22} rx={6} fill="#72A94B" />
            <rect x={26} y={120 - i * 23} width={68} height={5} rx={2.5} fill="#9CC654" />
          </g>
        ))}
        <g className="tg-splash__lid">
          <path d="M24 52h72a4 4 0 0 1 0 8H24a4 4 0 0 1 0-8Z" fill="#F6A934" />
          <path d="M32 52c4-9 14-13 28-13s24 4 28 13Z" fill="#F6A934" />
          <circle cx={60} cy={37} r={5} fill="#FB801C" />
        </g>
        <g className="tg-splash__clamp" fill="none" strokeWidth={3.5} strokeLinecap="round">
          <path d="M22 140V48M98 140V48" />
          <path d="M22 48c0-14 76-14 76 0" />
        </g>
      </svg>
      <BrandWordmark className="tg-splash__word text-[28px]" />
      <span className="tg-splash__line">Packing your tiffin</span>
    </div>
  );
}
