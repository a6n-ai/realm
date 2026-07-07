"use client";

import { useEffect } from "react";
import type { RealtimeEvent } from "../index";

// Subscribe to a channel's SSE stream. Auth rides the session cookie (same-origin
// EventSource). onEvent must be stable or cheap — it is stored in a ref by the
// caller so the stream isn't torn down on every render.
export function useChannel(channel: string | null, onEvent: (e: RealtimeEvent) => void): void {
  useEffect(() => {
    if (!channel) return;
    const source = new EventSource(`/api/realtime?channel=${encodeURIComponent(channel)}`);
    source.onmessage = (m) => {
      try {
        onEvent(JSON.parse(m.data) as RealtimeEvent);
      } catch {
        /* ignore malformed frame */
      }
    };
    return () => source.close();
    // onEvent intentionally excluded — callers pass a fresh closure each render;
    // re-subscribing per render would thrash the connection. Capture latest via
    // the ref pattern in the callers (usePresence/useTyping) instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);
}
