import type { Metadata } from "next";
import { Suspense } from "react";
import { LandingReviews } from "@/components/landing/landing-reviews";
import { postalArea } from "@foundry/delivery/fsa";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listFranchiseLocations } from "@/lib/services/organizations.service";
import { DeliverySection } from "@/components/landing/delivery-section";
import { LocationCard } from "./location-card";
import { pageMeta } from "@/lib/landing/meta";
import { publicPagesCache } from "@/lib/landing/public-cache";

export const metadata: Metadata = pageMeta("Delivery areas | Tiffin Grab", "Check your postal code on the map, and see every GTA area Tiffin Grab delivers to with its delivery window.", "/locations");
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  // Delivery zones are what customers need here ("do you deliver to me?"); franchise
  // kitchens stay below for the picker proxy.ts sends visitors to when no org resolves.
  const [{ zones }, locations] = await Promise.all([loadCatalogSnapshot(), publicPagesCache.getOrSet("locations", listFranchiseLocations)]);
  const areas = zones.filter((z) => z.active).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <section className="tg-section" aria-labelledby="tg-deliver">
        <DeliverySection heading="h1" />
      </section>
      <div className="tg-wrap flex flex-col gap-16 pb-24">
      <section className="tg-stack" aria-labelledby="tg-areas">
        <h2 id="tg-areas" className="tg-h2">Every area, every <span className="c-accent">code.</span></h2>
        <p className="tg-lede">Your postal code starts with one of these, and that sets your delivery window.</p>
        {areas.length === 0 ? (
          <p className="tg-lede">No delivery areas published yet.</p>
        ) : (
          <ul className="tg-card tg-areas">
            {areas.map((zone) => (
              <li key={zone.id}>
                <div className="tg-areas__name">
                  <strong>{zone.name}</strong>
                  {zone.slotWindow ? <span>Delivered {zone.slotWindow}</span> : null}
                </div>
                {zone.postalPrefixes.length > 0 ? (
                  <ul className="tg-areas__codes" aria-label={`${zone.name} postal codes`}>
                    {zone.postalPrefixes.map((prefix) => {
                      const area = postalArea(prefix);
                      return (
                        <li key={prefix} title={area?.neighbourhoods ?? area?.name ?? undefined}>{prefix}</li>
                      );
                    })}
                  </ul>
                ) : zone.radiusKm != null ? (
                  <span className="c-caption">Within {zone.radiusKm} km of our kitchen</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="c-caption m-0">Area names from <a href="https://www.geonames.org/" className="underline">GeoNames</a> (CC BY 4.0).</p>
      </section>

      {locations.length > 0 && (
        <div className="space-y-4">
          <h2 className="tg-h2">Our <span className="c-accent">kitchens.</span></h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {locations.map((loc) => (
              <LocationCard key={loc.id} location={loc} />
            ))}
          </div>
        </div>
      )}
      </div>
      {/* External Places fetch: a cache miss must not hold back the page. */}
      <Suspense fallback={null}><LandingReviews /></Suspense>
    </>
  );
}
