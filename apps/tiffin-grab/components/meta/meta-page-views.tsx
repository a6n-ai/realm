"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackMeta } from "@foundry/meta-pixel/client";
import { subscribeMetaPixel } from "@/lib/meta/browser";
import { sendMetaClientEvent } from "@/lib/meta/actions";

type MetaPvWindow = Window & { __tgMetaPv?: string };

/**
 * Client-route PageViews with a shared Pixel + CAPI event_id.
 * The analytics bootstrap covers the first view after consent; this covers App Router
 * navigations and retries once the pixel script becomes available.
 */
export function MetaPageViews() {
  const pathname = usePathname();

  useEffect(() => {
    return subscribeMetaPixel(() => {
      if (pathname.startsWith("/dashboard")) return;
      const w = window as MetaPvWindow;
      if (w.__tgMetaPv === pathname) return;
      w.__tgMetaPv = pathname;

      const eventId = crypto.randomUUID();
      trackMeta("PageView", {}, eventId);
      void sendMetaClientEvent({
        eventName: "PageView",
        eventId,
        eventSourceUrl: window.location.href,
      });
    });
  }, [pathname]);

  return null;
}
