"use client";

import { useRouter } from "next/navigation";
import { Navigation } from "lucide-react";
import { Button } from "@realm/ui/button";
import { StaticMap, writeFranchiseCookie } from "@realm/design-system";
import type { FranchiseLocation } from "@/lib/services/organizations.service";

// Turn-by-turn directions link, key-free.
function directionsHref(loc: FranchiseLocation): string {
  if (loc.latitude != null && loc.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc.address ?? loc.city ?? loc.name)}`;
}

export function LocationCard({ location }: { location: FranchiseLocation }) {
  const router = useRouter();
  const hasCoords = location.latitude != null && location.longitude != null;

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
      {hasCoords && (
        <StaticMap
          center={{ lat: location.latitude!, lng: location.longitude! }}
          markers={[{ lat: location.latitude!, lng: location.longitude!, title: location.name }]}
          heightPx={192}
        />
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
