"use server";

import { headers } from "next/headers";
import { isRateLimited } from "@foundry/commons";
import { awsPlaceProvider } from "@foundry/places";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { isFullPostalCode, parseCanadianPostalCode } from "@/lib/catalog/postal";
import { findZone } from "@/lib/catalog/zone-match";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";

export type DeliveryCheck =
  | { status: "invalid" | "busy" }
  | {
      status: "served" | "not_served";
      postalCode: string;
      zone: { name: string; slotWindow: string | null } | null;
      /** Where the postal code sits, for the map pin; null when the geocoder has nothing. */
      point: { lat: number; lng: number } | null;
    };

// Public and unauthenticated: a format check before anything paid runs, and a per-IP
// cap because every valid code costs one geocode.
export async function checkDelivery(raw: string): Promise<DeliveryCheck> {
  if (!isFullPostalCode(raw)) return { status: "invalid" };
  const ip = (await headers()).get("x-real-ip")?.trim() || "unknown";
  if (isRateLimited(ip, 20, 60_000, "landing-delivery-check")) return { status: "busy" };

  const postalCode = parseCanadianPostalCode(raw);
  const orgId = await resolveRequestOrg();
  const { zones } = await loadCatalogSnapshot(orgId);
  const [zone, place] = await Promise.all([
    findZone(zones.filter((z) => z.active), { postalCode }, orgId),
    awsPlaceProvider({ region: process.env.AWS_REGION }).resolve({ address: `${postalCode}, Canada`, persist: false }).catch(() => null),
  ]);
  return {
    status: zone ? "served" : "not_served",
    postalCode,
    zone: zone ? { name: zone.name, slotWindow: zone.slotWindow } : null,
    point: place ? { lat: place.lat, lng: place.lng } : null,
  };
}
