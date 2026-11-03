import { isRateLimited } from "@foundry/commons";
import { sendMetaEvent } from "@/lib/meta/capi";
import { requestHasAnalyticsConsent } from "@/lib/consent.server";
import { liveMetaRequestContext } from "@/lib/meta/request-context";
import { trustedIpHeaders } from "@/lib/runtime/platform";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!host) return false;
  // sendBeacon often omits Origin on same-site navigations; require a matching
  // Origin when present, otherwise allow only when Sec-Fetch-Site is same-origin/none.
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = request.headers.get("sec-fetch-site");
  return site === "same-origin" || site === "none" || site == null;
}

/**
 * Locked-down beacon for WhatsApp Contact clicks (page navigates away).
 * Accepts only event_name "Contact", UUID event_id; ignores any client user_data.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return new Response(null, { status: 403 });
  }

  const ip =
    trustedIpHeaders()
      .map((h) => request.headers.get(h)?.trim())
      .find(Boolean) || "unknown";
  if (isRateLimited(ip, 30, 60_000, "meta-events-beacon")) {
    return new Response(null, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const eventName = typeof body === "object" && body && "eventName" in body ? String((body as { eventName: unknown }).eventName) : "";
  const eventId = typeof body === "object" && body && "eventId" in body ? String((body as { eventId: unknown }).eventId).trim() : "";
  const eventSourceUrl =
    typeof body === "object" && body && "eventSourceUrl" in body
      ? String((body as { eventSourceUrl: unknown }).eventSourceUrl ?? "").trim() || undefined
      : undefined;

  if (eventName !== "Contact" || !UUID_RE.test(eventId)) {
    return new Response(null, { status: 400 });
  }

  // No consent: accept the beacon, send nothing.
  if (!(await requestHasAnalyticsConsent())) return new Response(null, { status: 204 });

  const ctx = await liveMetaRequestContext({ eventSourceUrl });
  sendMetaEvent({
    eventName: "Contact",
    eventId,
    eventSourceUrl: ctx.eventSourceUrl ?? eventSourceUrl,
    userData: {
      country: "ca",
      clientIpAddress: ctx.clientIpAddress,
      clientUserAgent: ctx.clientUserAgent,
      fbp: ctx.fbp,
      fbc: ctx.fbc,
    },
  });

  return new Response(null, { status: 204 });
}
