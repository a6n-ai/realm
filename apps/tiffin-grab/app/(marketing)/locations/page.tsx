import type { Metadata } from "next";
import { Clock, MapPin } from "lucide-react";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listFranchiseLocations } from "@/lib/services/organizations.service";
import { Section } from "@/components/marketing/section";
import { LocationCard } from "./location-card";

export const metadata: Metadata = {
  title: "Delivery Areas — Tiffin Grab",
  description: "The areas across the GTA where Tiffin Grab delivers, and when.",
};
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  // Delivery zones are what customers need here ("do you deliver to me?"); franchise
  // kitchens stay below for the picker proxy.ts sends visitors to when no org resolves.
  const [{ zones }, locations] = await Promise.all([loadCatalogSnapshot(), listFranchiseLocations()]);
  const areas = zones.filter((z) => z.active).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Section className="space-y-10">
      <div className="max-w-2xl">
        <p className="m-0 mb-1 text-xs font-semibold tracking-[0.25em] text-primary uppercase">Where we deliver</p>
        <h1 className="m-0 text-[clamp(30px,5vw,54px)] font-bold tracking-[-1.5px]">Delivery areas.</h1>
        <p className="text-muted-foreground mt-3">
          Your postal code decides your area. If it starts with one of the codes below, we deliver to you.
        </p>
      </div>

      {areas.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-2">
          <MapPin className="size-4" />
          No delivery areas published yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((zone) => (
            <div key={zone.id} className="space-y-3 rounded-2xl border-[1.5px] border-foreground p-4">
              <h2 className="m-0 flex items-center gap-2 text-lg font-semibold">
                <MapPin className="size-4 text-primary" />
                {zone.name}
              </h2>
              {zone.slotWindow && (
                <p className="text-muted-foreground m-0 flex items-center gap-2 text-sm">
                  <Clock className="size-4" />
                  Delivered {zone.slotWindow}
                </p>
              )}
              {zone.postalPrefixes.length > 0 ? (
                <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={`${zone.name} postal codes`}>
                  {zone.postalPrefixes.map((prefix) => (
                    <li key={prefix} className="rounded-full border border-foreground/30 px-2.5 py-0.5 font-mono text-xs">
                      {prefix}
                    </li>
                  ))}
                </ul>
              ) : (
                zone.radiusKm != null && (
                  <p className="text-muted-foreground m-0 text-sm">Within {zone.radiusKm} km of our kitchen</p>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {locations.length > 0 && (
        <div className="space-y-4">
          <h2 className="m-0 text-2xl font-bold">Our kitchens</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {locations.map((loc) => (
              <LocationCard key={loc.id} location={loc} />
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}
