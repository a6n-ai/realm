import { BreadcrumbSchema } from "@/components/landing/breadcrumb-schema";
import { siteOrgId } from "@/lib/tenant/site-org";
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
import { areaSlug, runsOf, sharedPrefixes } from "@/lib/landing/areas";
import Image from "next/image";
import { hourLabel } from "@/lib/landing/live-figures";
import "@/components/landing/styles/locations.css";
import "@/components/landing/styles/menu.css";
// Stock photo of dishes on our menu (Pixabay licence), the one the menu page uses.
import spreadPhoto from "@/public/landing/stock/dish-spread.jpg";

export const metadata: Metadata = pageMeta("Tiffin Delivery Areas: Brampton to Durham | Tiffin Grab", "Tiffin delivery across the GTA: Toronto, Brampton, Mississauga, Markham, Vaughan, Scarborough, Oakville and more. Tap your area on the map for its delivery window.", "/locations");
export const revalidate = 3600;
export const dynamic = "error";

export default async function LocationsPage({ params }: { params: Promise<{ org: string }> }) {
  const orgId = await siteOrgId((await params).org);
  // Delivery zones are what customers need here ("do you deliver to me?"); franchise
  // kitchens stay below for the picker proxy.ts sends visitors to when no org resolves.
  const [{ zones, cutoffHour }, locations] = await Promise.all([loadCatalogSnapshot(), publicPagesCache.getOrSet("locations", listFranchiseLocations)]);
  const areas = zones.filter((z) => z.active).sort((a, b) => a.name.localeCompare(b.name));
  const cutoff = cutoffHour != null ? hourLabel(cutoffHour) : null;
  const runs = runsOf(areas);

  return (
    <>
      <BreadcrumbSchema name="Delivery areas" path="/locations" />
      <section className="tg-section" aria-labelledby="tg-deliver">
        <DeliverySection heading="h1" orgId={orgId} />
      </section>
      <div className="tg-wrap flex flex-col gap-16 pt-12 pb-24 md:pt-20">
      {/* The day's runs: areas grouped by their real delivery window, read like a timetable. */}
      <section className="tg-stack gap-10" aria-labelledby="tg-areas">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <div className="tg-stack items-start">
            <h2 id="tg-areas" className="tg-h2">The day&apos;s <span className="c-accent">runs.</span></h2>
            <p className="tg-lede">Your postal code sets your run, and your run sets the window your tiffin arrives in.</p>
            {cutoff ? <p className="c-caption m-0">Change or pause any day by {cutoff} the night before. Same cutoff on every run.</p> : null}
            <p className="c-caption m-0">Where a postal code sits on two runs, your full postal code decides which one.</p>
          </div>
          <figure className="lp-menu-photo relative !mb-0 w-full !aspect-[16/10]">
            <Image src={spreadPhoto} alt="A spread of home-style Indian dishes: sabzi, dal, rice and roti" placeholder="blur" fill sizes="(max-width: 1023px) 100vw, 45vw" />
          </figure>
        </div>
        {runs.length === 0 ? (
          <p className="tg-lede">No delivery areas published yet.</p>
        ) : (
          <ol className="m-0 list-none border-t border-[var(--border)] p-0">
            {runs.map((run) => (
              <li key={run.key} className="grid gap-4 border-b border-[var(--border)] py-8 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-10">
                <p className="tg-h2 m-0 self-start tabular-nums md:sticky md:top-28">{run.label}</p>
                <ul className="m-0 grid list-none gap-x-10 gap-y-6 p-0 sm:grid-cols-2">
                  {run.zones.map((zone) => (
                    // Anchored (/locations#brampton): the footer's area links land here; old /locations/<area> pages redirect here.
                    <li key={zone.id} id={areaSlug(zone.name)} className="flex scroll-mt-28 flex-col gap-2">
                      <strong className="text-lg">{zone.name}</strong>
                      {zone.postalPrefixes.length > 0 ? (
                        <ul className="tg-areas__codes" aria-label={`${zone.name} postal codes`}>
                          {zone.postalPrefixes.map((prefix) => {
                            const area = postalArea(prefix);
                            return <li key={prefix} title={area?.neighbourhoods ?? area?.name ?? undefined}>{prefix}</li>;
                          })}
                        </ul>
                      ) : zone.radiusKm != null ? (
                        <span className="c-caption">Within {zone.radiusKm} km of our kitchen</span>
                      ) : null}
                      {sharedNote(zone, areas)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
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

type Zone = Awaited<ReturnType<typeof loadCatalogSnapshot>>["zones"][number];

// Codes another active area also lists (L4J in Vaughan and Thornhill, M4B inside Toronto's M4), said honestly.
function sharedNote(zone: Zone, zones: Zone[]) {
  const shared = [...sharedPrefixes(zone, zones)];
  if (shared.length === 0) return null;
  const runs = [...new Set(shared.flatMap(([, others]) => others.map((o) => o.name)))].join(" and ");
  return <span className="c-caption">{shared.map(([p]) => p).join(", ")} {shared.length > 1 ? "are" : "is"} also on the {runs} run.</span>;
}
