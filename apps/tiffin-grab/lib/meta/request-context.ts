import { cookies, headers } from "next/headers";
import { trustedIpHeaders } from "@/lib/runtime/platform";
import { requestHasAnalyticsConsent } from "@/lib/consent.server";
import type { MetaAttribution } from "./types";

const FBCLID = /(?:^|[?&#])fbclid=([^&#]+)/i;

/** Build `_fbc` when Pixel never set the cookie but the URL still has `fbclid`. */
export function fbcFromFbclid(url: string | null | undefined, nowMs = Date.now()): string | undefined {
  if (!url) return undefined;
  const m = url.match(FBCLID);
  const fbclid = m?.[1]?.trim();
  if (!fbclid) return undefined;
  return `fb.1.${nowMs}.${fbclid}`;
}

function firstHeader(h: Headers, names: string[]): string | undefined {
  for (const n of names) {
    const v = h.get(n)?.trim();
    if (v) return v;
  }
  return undefined;
}

/**
 * Capture Meta click IDs + request context from the *current* request.
 * Call only on the customer's browser-driven request (checkout, marketing actions) —
 * never from Stripe webhooks or staff verifies.
 */
export async function captureMetaAttribution(opts?: {
  eventSourceUrl?: string | null;
}): Promise<MetaAttribution> {
  if (!(await requestHasAnalyticsConsent())) return { consent: false };
  const h = await headers();
  const c = await cookies();
  const eventSourceUrl = opts?.eventSourceUrl?.trim() || undefined;
  const fbp = c.get("_fbp")?.value?.trim() || undefined;
  const fbc = c.get("_fbc")?.value?.trim() || fbcFromFbclid(eventSourceUrl) || undefined;
  const clientIpAddress = firstHeader(h, trustedIpHeaders()) || undefined;
  const clientUserAgent = h.get("user-agent")?.trim() || undefined;
  const out: MetaAttribution = {};
  if (clientIpAddress) out.clientIpAddress = clientIpAddress;
  if (clientUserAgent) out.clientUserAgent = clientUserAgent;
  if (fbp) out.fbp = fbp;
  if (fbc) out.fbc = fbc;
  if (eventSourceUrl) out.eventSourceUrl = eventSourceUrl;
  return out;
}

/** Live request context for immediate CAPI events (ViewContent, Contact, FindLocation, …). */
export async function liveMetaRequestContext(opts?: {
  eventSourceUrl?: string | null;
}): Promise<Pick<MetaAttribution, "clientIpAddress" | "clientUserAgent" | "fbp" | "fbc" | "eventSourceUrl">> {
  return captureMetaAttribution(opts);
}
