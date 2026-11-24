"use client";

import { useEffect, useRef } from "react";
import { trackMeta } from "@foundry/meta-pixel/client";
import { subscribeMetaPixel } from "@/lib/meta/browser";
import { sendMetaClientEvent } from "@/lib/meta/actions";

type Props = {
  contentIds?: string[];
  contentName?: string;
  contentType?: string;
};

/** Mount once per marketing page view: Pixel + CAPI ViewContent with one event_id. */
export function MetaViewContent({ contentIds, contentName, contentType = "product" }: Props) {
  const fired = useRef(false);

  useEffect(() => {
    return subscribeMetaPixel(() => {
      if (fired.current) return;
      fired.current = true;
      const eventId = crypto.randomUUID();
      const params = {
        ...(contentIds?.length ? { content_ids: contentIds, content_type: contentType } : {}),
        ...(contentName ? { content_name: contentName } : {}),
      };
      trackMeta("ViewContent", params, eventId);
      void sendMetaClientEvent({
        eventName: "ViewContent",
        eventId,
        eventSourceUrl: window.location.href,
        customData: params,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
