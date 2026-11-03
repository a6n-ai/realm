"use client";

import { useEffect, useRef } from "react";
import { sendMetaClientEvent } from "@/lib/meta/actions";
import { trackMeta } from "@foundry/meta-pixel/client";

type Props = {
  contentIds?: string[];
  contentName?: string;
  contentType?: string;
};

/** Mount once per marketing page view: Pixel + CAPI ViewContent with one event_id. */
export function MetaViewContent({ contentIds, contentName, contentType = "product" }: Props) {
  const fired = useRef(false);

  useEffect(() => {
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
    // Intentionally once per mount (one page view); ignore prop identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
