"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type Fbq = (cmd: "track", event: string, params?: Record<string, unknown>, opts?: { eventID?: string }) => void;

/** No-op until the pixel bootstrap (/api/analytics) has defined window.fbq, and on staff pages. */
export function fbqTrack(event: string, params?: Record<string, unknown>, eventID?: string): void {
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  if (!fbq || location.pathname.startsWith("/dashboard")) return;
  fbq("track", event, params, eventID ? { eventID } : undefined);
}

/** No-op until gtag (/api/analytics) is loaded, and on staff pages. GA tracks page views itself. */
export function gtagEvent(name: string, params?: Record<string, unknown>): void {
  const gtag = (window as unknown as { gtag?: (cmd: "event", name: string, params?: Record<string, unknown>) => void }).gtag;
  if (!gtag || location.pathname.startsWith("/dashboard")) return;
  gtag("event", name, params);
}

/** Client navigations don't reload the page, so PageView is sent here; the bootstrap sends the first one. */
export function MetaPixelPageViews() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    fbqTrack("PageView");
  }, [pathname]);
  return null;
}
