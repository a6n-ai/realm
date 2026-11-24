"use client";

type Fbq = (cmd: string, event: string, params?: Record<string, unknown>, opts?: { eventID?: string }) => void;

/**
 * Custom Pixel events. `fbq('track')` is only for Meta's standard names; a custom
 * name sent that way does not keep `eventID`, so the server copy cannot dedupe.
 */
export function trackMetaCustom(eventName: string, params: Record<string, unknown> = {}, eventID?: string): void {
  if (typeof window === "undefined") return;
  if (location.pathname.startsWith("/dashboard")) return;
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  if (typeof fbq !== "function") return;
  const id = eventID?.trim();
  fbq("trackCustom", eventName, params, id ? { eventID: id } : undefined);
}

/**
 * Run when the Pixel stub exists. The analytics bootstrap dispatches
 * `tg:meta-pixel-ready` after init, so a mount that raced the script still fires.
 */
export function subscribeMetaPixel(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const run = () => {
    const fbq = (window as unknown as { fbq?: unknown }).fbq;
    if (typeof fbq !== "function") return;
    fn();
  };
  run();
  window.addEventListener("tg:meta-pixel-ready", run);
  return () => window.removeEventListener("tg:meta-pixel-ready", run);
}
