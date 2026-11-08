"use server";

import { headers } from "next/headers";
import { isRateLimited } from "@foundry/commons";
import { awsPlaceProvider } from "@foundry/places";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { isFullPostalCode, parseCanadianPostalCode } from "@/lib/catalog/postal";
import { findZone } from "@/lib/catalog/zone-match";
import { sendMetaEvent } from "@/lib/meta/capi";
import { requestHasAnalyticsConsent } from "@/lib/consent.server";
import { liveMetaRequestContext } from "@/lib/meta/request-context";
import { trustedIpHeaders } from "@/lib/runtime/platform";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { awsRegion } from "@/lib/runtime/env";

export type DeliveryCheck =
  | { status: "invalid" | "busy" }
  | {
      status: "served" | "not_served";
      postalCode: string;
      zone: { name: string; slotWindow: string | null } | null;
      /** Where the postal code sits, for the map pin; null when the geocoder has nothing. */
      point: { lat: number; lng: number } | null;
    };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Public and unauthenticated: a format check before anything paid runs, and a per-IP
// cap because every valid code costs one geocode.
export async function checkDelivery(
  raw: string,
  opts?: { eventId?: string | null; eventSourceUrl?: string | null },
): Promise<DeliveryCheck> {
  if (!isFullPostalCode(raw)) return { status: "invalid" };
  const ip = (await headers()).get(trustedIpHeaders()[0])?.trim() || "unknown";
  if (isRateLimited(ip, 20, 60_000, "landing-delivery-check")) return { status: "busy" };

  const postalCode = parseCanadianPostalCode(raw);
  const orgId = await resolveRequestOrg();
  const { zones } = await loadCatalogSnapshot(orgId);
  const [zone, place] = await Promise.all([
    findZone(zones.filter((z) => z.active), { postalCode }, orgId),
    awsPlaceProvider({ region: awsRegion() }).resolve({ address: `${postalCode}, Canada`, persist: false }).catch(() => null),
  ]);
  const result: DeliveryCheck = {
    status: zone ? "served" : "not_served",
    postalCode,
    zone: zone ? { name: zone.name, slotWindow: zone.slotWindow } : null,
    point: place ? { lat: place.lat, lng: place.lng } : null,
  };

  const eventId = opts?.eventId?.trim() ?? "";
  if (UUID_RE.test(eventId) && (await requestHasAnalyticsConsent())) {
    const ctx = await liveMetaRequestContext({ eventSourceUrl: opts?.eventSourceUrl });
    sendMetaEvent({
      eventName: "FindLocation",
      eventId,
      eventSourceUrl: ctx.eventSourceUrl ?? opts?.eventSourceUrl,
      userData: {
        postalCode,
        country: "ca",
        clientIpAddress: ctx.clientIpAddress,
        clientUserAgent: ctx.clientUserAgent,
        fbp: ctx.fbp,
        fbc: ctx.fbc,
      },
    });
  }

  return result;
}
