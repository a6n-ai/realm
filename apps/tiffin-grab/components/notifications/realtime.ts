"use client";

import type { RealtimeNotification } from "@relay/engine/ui";

export type { RealtimeNotification };

/**
 * SSE transport for the bell. The frame carries no payload, so this calls back with nothing
 * and the bell refetches its feed. Auth rides the session cookie (same-origin EventSource).
 */
export function makeSubscriber(userPublicId: string) {
  return async (onEvent: (n?: RealtimeNotification) => void): Promise<() => void> => {
    const source = new EventSource(`/api/realtime?channel=${encodeURIComponent(`notify:${userPublicId}`)}`);
    source.onmessage = () => onEvent();
    return () => source.close();
  };
}
