"use client";

import { useRouter } from "next/navigation";
import { writeFranchiseCookie } from "@realm/design-system";
import { Btn } from "@/components/brutal/shared";
import type { FranchiseLocation } from "@/lib/services/organizations.service";

// output=embed needs no API key — a plain lat,lng query is enough for a pin.
function mapEmbedSrc(loc: FranchiseLocation): string | null {
  if (!loc.storeLat || !loc.storeLng) return null;
  return `https://www.google.com/maps?q=${loc.storeLat},${loc.storeLng}&output=embed`;
}

// Turn-by-turn directions link, also key-free — distinct from the embed above.
function directionsHref(loc: FranchiseLocation): string {
  if (loc.storeLat && loc.storeLng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${loc.storeLat},${loc.storeLng}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc.address ?? loc.city ?? loc.name)}`;
}

export function LocationCard({ location }: { location: FranchiseLocation }) {
  const router = useRouter();
  const mapSrc = mapEmbedSrc(location);

  // Explicitly overrides any franchise already picked — someone ordering for
  // a friend in another city should be able to switch right from this list,
  // not just on first visit.
  function startOrdering() {
    writeFranchiseCookie(location.clientCode);
    router.push("/eats");
    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-2xl border-4 border-black">
      {mapSrc && (
        <iframe title={`Map for ${location.name}`} src={mapSrc} className="h-48 w-full border-0" loading="lazy" />
      )}
      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-lg font-bold">{location.name}</h3>
          <p className="text-sm opacity-70">{location.address ?? location.city}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn size="sm" onClick={startOrdering}>
            Start ordering
          </Btn>
          <Btn size="sm" variant="white" href={directionsHref(location)}>
            Get directions
          </Btn>
        </div>
      </div>
    </div>
  );
}
