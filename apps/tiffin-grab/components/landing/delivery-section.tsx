import { DeliveryCheck } from "@/components/landing/delivery-check";
import { publicPagesCache } from "@/lib/landing/public-cache";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { deliveryService } from "@/lib/services/delivery.service";

// "Do we deliver to you?": one map card. Every area we serve is a dot on the map,
// and the postal check floats over it.
export async function DeliverySection({ heading = "h2", orgId }: { heading?: "h1" | "h2"; orgId: string | null }) {
  const [{ zones }, origin] = await Promise.all([loadCatalogSnapshot(orgId), publicPagesCache.getOrSet(`origin:${orgId ?? "brand"}`, () => deliveryService.getStoreOrigin(orgId)).catch(() => null)]);
  const active = zones.filter((z) => z.active).sort((a, b) => a.name.localeCompare(b.name));
  // Points are geocoded when a zone is saved (deliveryService.saveZone); a zone without one has no dot.
  const areas = active.map((z) => ({ name: z.name, slotWindow: z.slotWindow, point: z.lat != null && z.lng != null ? { lat: z.lat, lng: z.lng } : null }));
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
