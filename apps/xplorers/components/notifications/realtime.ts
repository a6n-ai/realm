"use client";

// Presence frames (sent on connect and when another tab opens/closes) are not news.
const isPing = (e: MessageEvent) => {
  try {
    return (JSON.parse(e.data) as { type?: string }).type === "message";
  } catch {
    return false;
  }
};

/**
 * SSE transport for the bell — same ping-only pattern as tiffin-grab / puchkaman.
 * Auth rides the session cookie (same-origin EventSource).
 */
export function makeSubscriber(userPublicId: string) {
  return async (onEvent: () => void): Promise<() => void> => {
    const channel = `notify:${userPublicId}`;
    const source = new EventSource(`/api/realtime?channel=${encodeURIComponent(channel)}`);
    source.onmessage = (e) => {
      if (isPing(e)) onEvent();
    };
    return () => source.close();
  };
}
