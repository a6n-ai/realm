import { coveringZones, hasCircleZones, haversineKm, type Zone } from "@foundry/delivery";
import { awsPlaceProvider } from "@foundry/places";
import { ValidationError } from "@foundry/commons";
import { deliveryService } from "@/lib/services/delivery.service";
import { loadCatalogSnapshot } from "./load";
import { parseCanadianPostalCode } from "./postal";

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

/** Refuses an address no active zone serves — orders and saved addresses are for our zones only. */
export async function assertServiceable(at: ZoneLocation, orgId?: string | null): Promise<void> {
  const { zones } = await loadCatalogSnapshot(orgId);
  if ((await findZone(zones.filter((z) => z.active), at, orgId)) == null) {
    throw new ValidationError(`We don't deliver to ${at.postalCode} yet. See our delivery areas.`);
  }
}

/** assertServiceable for a saved-address form: format first, then zone. */
export async function assertAddressServiceable(
  input: { addressLine: string; city: string; postalCode: string },
  orgId?: string | null,
): Promise<void> {
  const postalCode = parseCanadianPostalCode(input.postalCode);
  await assertServiceable({ postalCode, address: [input.addressLine, input.city, postalCode].filter(Boolean).join(", ") }, orgId);
}
