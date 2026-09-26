import { coveringZones, hasCircleZones, haversineKm, type Zone } from "@foundry/delivery";
import { awsPlaceProvider } from "@foundry/places";
import { deliveryService } from "@/lib/services/delivery.service";

export type ZoneLocation = {
  postalCode: string;
  /** Already-geocoded address, when the caller has one (checkout confirm). */
  lat?: number | null;
  lng?: number | null;
  /** Geocoded only when no postal zone matches and a radius circle exists. */
  address?: string | null;
};

/**
 * The zone serving an address: a postal zone match first, else the smallest circle around
 * the store covering it. Geocodes only when circles exist and no postal zone matched, so a
 * postal-only setup never calls the geocoder.
 */
export async function findZone<Z extends Zone>(zones: Z[], at: ZoneLocation, orgId?: string | null): Promise<Z | null> {
  const [postal] = coveringZones({ postalCode: at.postalCode }, zones);
  if (postal) return postal;
  if (!hasCircleZones(zones)) return null;

  const origin = await deliveryService.getStoreOrigin(orgId);
  if (!origin) return null;
  let point = at.lat != null && at.lng != null ? { lat: at.lat, lng: at.lng } : null;
  if (!point) {
    // persist: false — the point only yields a distance; nothing is stored.
    const hit = await awsPlaceProvider()
      .resolve({ address: at.address?.trim() || at.postalCode, persist: false })
      .catch(() => null);
    point = hit ? { lat: hit.lat, lng: hit.lng } : null;
  }
  if (!point) return null;
  const [circle] = coveringZones({ distanceKm: haversineKm(origin.lat, origin.lng, point.lat, point.lng) }, zones);
  return circle ?? null;
}
