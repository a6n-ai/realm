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
