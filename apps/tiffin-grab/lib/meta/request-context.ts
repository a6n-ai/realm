import { cookies, headers } from "next/headers";
import { trustedIpHeaders } from "@/lib/runtime/platform";
import { requestHasAnalyticsConsent } from "@/lib/consent.server";
import { fbcFromFbclid } from "@foundry/meta-pixel";
import { META_EXTERNAL_ID_COOKIE, metaExternalIdFromCookie } from "./external-id";
import type { MetaAttribution } from "./types";

/** Checkout/CAPI context. `externalId` is the first-party cookie the Pixel was inited with. */
export type CapturedMetaAttribution = MetaAttribution & { externalId?: string };

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
}): Promise<CapturedMetaAttribution> {
  if (!(await requestHasAnalyticsConsent())) return { consent: false };
  const h = await headers();
  const c = await cookies();
  const eventSourceUrl = opts?.eventSourceUrl?.trim() || undefined;
  const fbp = c.get("_fbp")?.value?.trim() || undefined;
  const fbc = c.get("_fbc")?.value?.trim() || fbcFromFbclid(eventSourceUrl) || undefined;
  const externalId = metaExternalIdFromCookie(c.get(META_EXTERNAL_ID_COOKIE)?.value);
  const clientIpAddress = firstHeader(h, trustedIpHeaders()) || undefined;
  const clientUserAgent = h.get("user-agent")?.trim() || undefined;
  const out: CapturedMetaAttribution = {};
  if (clientIpAddress) out.clientIpAddress = clientIpAddress;
  if (clientUserAgent) out.clientUserAgent = clientUserAgent;
  if (fbp) out.fbp = fbp;
  if (fbc) out.fbc = fbc;
  if (externalId) out.externalId = externalId;
  if (eventSourceUrl) out.eventSourceUrl = eventSourceUrl;
  return out;
}

export async function liveMetaRequestContext(opts?: {
  eventSourceUrl?: string | null;
}): Promise<Pick<CapturedMetaAttribution, "clientIpAddress" | "clientUserAgent" | "fbp" | "fbc" | "eventSourceUrl" | "externalId">> {
  return captureMetaAttribution(opts);
}
