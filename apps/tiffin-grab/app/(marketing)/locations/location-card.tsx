"use client";

import Link from "next/link";
import { Button } from "@realm/ui/button";
import type { FranchiseLocation } from "@/lib/services/organizations.service";

// output=embed needs no API key — a plain lat,lng query is enough for a pin.
function mapEmbedSrc(loc: FranchiseLocation): string | null {
  if (loc.latitude == null || loc.longitude == null) return null;
  return `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}&output=embed`;
}

export function LocationCard({ location }: { location: FranchiseLocation }) {
  const mapSrc = mapEmbedSrc(location);
  return (
    <div className="overflow-hidden rounded-2xl border-[1.5px] border-foreground">
      {mapSrc && (
        <iframe title={`Map for ${location.name}`} src={mapSrc} className="h-48 w-full border-0" loading="lazy" />
      )}
      <div className="space-y-2 p-4">
        <h3 className="text-lg font-semibold">{location.name}</h3>
        <p className="text-muted-foreground text-sm">{location.address ?? location.city}</p>
        <Button asChild size="sm" variant="outline">
          <Link href={`/${location.clientCode}`}>Order from here</Link>
        </Button>
      </div>
    </div>
  );
}
