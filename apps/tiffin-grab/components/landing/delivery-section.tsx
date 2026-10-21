import { awsPlaceProvider } from "@foundry/places";
import { DeliveryCheck } from "@/components/landing/delivery-check";
import { sharedCache } from "@/lib/cache";
import { publicPagesCache } from "@/lib/landing/public-cache";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { deliveryService } from "@/lib/services/delivery.service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";

// Area names barely move, so each geocode is kept a week: a handful of lookups
// per week, not one per visitor.
const areaCache = sharedCache("landing-areas", 7 * 24 * 60 * 60 * 1000);

async function areaPoint(name: string) {
  return areaCache
    .getOrSet(`point:${name.toLowerCase()}`, async () => {
      const hit = await awsPlaceProvider({ region: process.env.AWS_REGION }).resolve({ address: `${name}, Ontario, Canada`, persist: false }).catch(() => null);
      return hit ? { lat: hit.lat, lng: hit.lng } : null;
    })
    .catch(() => null);
}

// "Do we deliver to you?": one map card. Every area we serve is a dot on the map,
// and the postal check floats over it.
export async function DeliverySection({ heading = "h2" }: { heading?: "h1" | "h2" }) {
  const orgId = await resolveRequestOrg();
  const [{ zones }, origin] = await Promise.all([loadCatalogSnapshot(orgId), publicPagesCache.getOrSet(`origin:${orgId ?? "brand"}`, () => deliveryService.getStoreOrigin(orgId)).catch(() => null)]);
  const active = zones.filter((z) => z.active).sort((a, b) => a.name.localeCompare(b.name));
  const points = await Promise.all(active.map((z) => areaPoint(z.name)));
  const areas = active.map((z, i) => ({ name: z.name, slotWindow: z.slotWindow, point: points[i] ?? null }));
  const rings = active.filter((z) => z.radiusKm != null && z.radiusKm > 0).map((z) => ({ name: z.name, radiusKm: z.radiusKm! }));
  const H = heading;
  return (
    <div className="tg-wrap">
      <div className="tg-deliver__head">
        <H id="tg-deliver" className="tg-h2">Do we deliver to <span className="c-accent">you?</span></H>
        <p className="tg-lede">
          {areas.length > 0 ? `${areas.length} areas across the GTA, and growing. ` : ""}Check your postal code against the areas we serve today.
        </p>
      </div>
      <DeliveryCheck origin={origin ? { lat: origin.lat, lng: origin.lng } : null} rings={rings} areas={areas} />
    </div>
  );
}
