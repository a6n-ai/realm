"use client";

import type { RealtimeNotification } from "@relay/engine/ui";

export type { RealtimeNotification };

/**
 * Real-time push transport for this app's bell. The Amplify/AppSync backend was
 * removed with the move to EC2; the self-hosted deploy will rewire this to the
 * SSE feed (puchkaman already passes an SSE subscriber of this shape).
 *
 * Until then this is a no-op and the bell works via the REST feed plus the
 * focus refetch. Kept wired rather than deleted so the seam stays visible.
 * ponytail: stub, replace body when the SSE transport lands.
 */
export async function subscribeNotifications(
  _onEvent: (n?: RealtimeNotification) => void,
): Promise<() => void> {
  return () => {};
}
