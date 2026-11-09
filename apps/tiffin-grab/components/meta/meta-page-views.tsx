"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackMeta } from "@foundry/meta-pixel/client";
import { sendMetaClientEvent } from "@/lib/meta/actions";

type MetaPvWindow = Window & { __tgMetaPv?: string; fbq?: unknown };

/**
 * Client-route PageViews with a shared Pixel + CAPI event_id.
 * The analytics bootstrap covers the first view after consent; this covers App Router navigations
 * and retries once the pixel script becomes available.
 */
export function MetaPageViews() {
  const pathname = usePathname();

  useEffect(() => {
    const fire = () => {
      if (typeof window === "undefined") return;
      if (pathname.startsWith("/dashboard")) return;
      const w = window as MetaPvWindow;
      if (typeof w.fbq !== "function") return;
      if (w.__tgMetaPv === pathname) return;
      w.__tgMetaPv = pathname;

      const eventId = crypto.randomUUID();
      trackMeta("PageView", {}, eventId);
      void sendMetaClientEvent({
        eventName: "PageView",
        eventId,
        eventSourceUrl: window.location.href,
      });
    };

    fire();
    window.addEventListener("tg:meta-pixel-ready", fire);
    return () => window.removeEventListener("tg:meta-pixel-ready", fire);
  }, [pathname]);

  return null;
}
