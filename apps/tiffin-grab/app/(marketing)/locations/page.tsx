import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { listFranchiseLocations } from "@/lib/services/organizations.service";
import { Section } from "@/components/marketing/section";
import { LocationCard } from "./location-card";

export const metadata: Metadata = { title: "Our Locations — Tiffin Grab", description: "Find the Tiffin Grab franchise closest to you." };
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const locations = await listFranchiseLocations();
  return (
    <Section className="space-y-10">
      <div className="max-w-2xl">
        <p className="m-0 mb-1 text-xs font-semibold tracking-[0.25em] text-primary uppercase">Where we deliver</p>
        <h1 className="m-0 text-[clamp(30px,5vw,54px)] font-bold tracking-[-1.5px]">Our locations.</h1>
      </div>
      {locations.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-2">
          <MapPin className="size-4" />
          No locations published yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {locations.map((loc) => (
            <LocationCard key={loc.id} location={loc} />
          ))}
        </div>
      )}
    </Section>
  );
}
