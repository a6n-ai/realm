"use client";

export interface RealtimeNotification {
  publicId: string;
  event: string;
  title: string;
  body: string;
  href: string | null;
}

/**
 * Real-time push transport. The Amplify/AppSync backend was removed; the
 * self-hosted deploy will rewire this to the SSE/Redis feed. Until then this is
 * a no-op and the bell works via the REST feed.
 * ponytail: stub, replace body when the SSE transport lands.
 */
export async function subscribeNotifications(
  _onEvent: (n: RealtimeNotification) => void,
): Promise<() => void> {
  return () => {};
}
