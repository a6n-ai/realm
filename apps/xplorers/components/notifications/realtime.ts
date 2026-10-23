"use client";

import { openChannel } from "@foundry/realtime/client";

/**
 * Bell transport: WebSocket via the realtime Worker, falling back to the app's SSE route.
 * Only `message` frames are news; presence frames are ignored.
 */
export function makeSubscriber(userPublicId: string) {
  return async (onEvent: () => void): Promise<() => void> =>
    openChannel(`notify:${userPublicId}`, (e) => {
      if (e.type === "message") onEvent();
    });
}
