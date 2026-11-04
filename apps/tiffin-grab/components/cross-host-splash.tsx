"use client";

import { useEffect, useState } from "react";
import { apexServes } from "@/lib/routing/apex";

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
  return (
    <div className="tg-splash" role="status" aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element -- already cached by the header */}
      <img src="/brand/mark.svg" alt="" width={56} height={56} />
      <span className="sr-only">Loading</span>
    </div>
  );
}
