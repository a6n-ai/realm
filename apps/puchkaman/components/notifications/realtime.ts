"use client";

/**
 * SSE transport for the bell. @foundry/realtime's message frame carries no
 * payload, so this calls back with nothing and the hook refetches the feed.
 * Auth rides the session cookie (same-origin EventSource).
 */
export function makeSubscriber(userPublicId: string) {
  return async (onEvent: () => void): Promise<() => void> => {
    const channel = `notify:${userPublicId}`;
    const source = new EventSource(`/api/realtime?channel=${encodeURIComponent(channel)}`);
    source.onmessage = () => onEvent();
    return () => source.close();
  };
}
