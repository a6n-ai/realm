"use client";

import { useRouter } from "next/navigation";
import { Navigation } from "lucide-react";
import { Button } from "@realm/ui/button";
import { writeFranchiseCookie } from "@realm/design-system";
import type { FranchiseLocation } from "@/lib/services/organizations.service";

// output=embed needs no API key — a plain lat,lng query is enough for a pin.
function mapEmbedSrc(loc: FranchiseLocation): string | null {
  if (loc.latitude == null || loc.longitude == null) return null;
  return `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}&output=embed`;
}

// Turn-by-turn directions link, also key-free — distinct from the embed above.
function directionsHref(loc: FranchiseLocation): string {
  if (loc.latitude != null && loc.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}`;
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
    router.push("/menu");
    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-2xl border-[1.5px] border-foreground">
      {mapSrc && (
        <iframe title={`Map for ${location.name}`} src={mapSrc} className="h-48 w-full border-0" loading="lazy" />
      )}
      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-lg font-semibold">{location.name}</h3>
          <p className="text-muted-foreground text-sm">{location.address ?? location.city}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={startOrdering}>
            Start ordering
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={directionsHref(location)} target="_blank" rel="noopener noreferrer">
              <Navigation className="size-4" />
              Get directions
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
