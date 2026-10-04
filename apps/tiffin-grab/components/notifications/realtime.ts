"use client";

import type { RealtimeNotification } from "@relay/engine/ui";

export type { RealtimeNotification };

// Presence frames (sent on connect and when another tab opens/closes) are not news.
const isPing = (e: MessageEvent) => {
  try {
    return (JSON.parse(e.data) as { type?: string }).type === "message";
  } catch {
    return false;
  }
};

/**
 * SSE transport for the bell. The frame carries no payload, so this calls back with nothing
 * and the bell refetches its feed. Auth rides the session cookie (same-origin EventSource).
 */
export function makeSubscriber(userPublicId: string) {
  return async (onEvent: (n?: RealtimeNotification) => void): Promise<() => void> => {
    const source = new EventSource(`/api/realtime?channel=${encodeURIComponent(`notify:${userPublicId}`)}`);
    source.onmessage = (e) => {
      if (isPing(e)) onEvent();
    };
    return () => source.close();
  };
}
