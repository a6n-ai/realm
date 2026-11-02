"use client";

import { openChannel } from "@foundry/realtime/client";
import type { RealtimeNotification } from "@relay/engine/ui/use-notifications";

export type { RealtimeNotification };

/**
 * Bell transport: WebSocket via the realtime Worker, falling back to the app's SSE route.
 * The frame carries no payload, so this calls back with nothing and the bell refetches its feed.
 * Presence frames are not news.
 */
export function makeSubscriber(userPublicId: string) {
  return async (onEvent: (n?: RealtimeNotification) => void): Promise<() => void> =>
    openChannel(`notify:${userPublicId}`, (e) => {
      if (e.type === "message") onEvent();
    });
}
