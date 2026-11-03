"use client";

export type MetaTrackParams = {
  value?: number;
  currency?: string;
  content_ids?: string[];
  content_type?: string;
  content_name?: string;
  num_items?: number;
};

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    __tgMetaPageViewBoot?: number;
  }
}

/** Browser Pixel track with shared eventID for CAPI dedup. No-ops until fbq loads. */
export function trackMeta(
  eventName: string,
  params: MetaTrackParams | Record<string, unknown> = {},
  eventID: string,
): void {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  if (location.pathname.startsWith("/dashboard")) return;
  const id = eventID.trim();
  if (!id) return;
  window.fbq("track", eventName, params, { eventID: id });
}
