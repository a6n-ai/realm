"use client";

import { useCallback, useRef } from "react";
import { Circle, GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";
import { Skeleton } from "@realm/ui/skeleton";

const CONTAINER_STYLE: React.CSSProperties = { width: "100%", height: "100%", minHeight: 420 };
const RING_GAP_KM = 0.01;

export type MapZone = {
  publicId: string;
  name: string;
  radiusKm: number;
  active: boolean;
  color: string;
};

/**
 * Clamp a candidate radius (km) between the next-smaller and next-larger
 * *other* active zone, mirroring the server-side clamp in actions.ts. This
 * copy only drives live visual feedback while dragging — the server clamp
 * is what's authoritative, in case the two ever disagree.
 */
export function clampRadiusKm(radiusKm: number, zones: MapZone[], excludePublicId: string): number {
  const others = zones.filter((z) => z.active && z.publicId !== excludePublicId);
  const smaller = others.map((z) => z.radiusKm).filter((r) => r < radiusKm);
  const larger = others.map((z) => z.radiusKm).filter((r) => r > radiusKm);
  const lower = smaller.length ? Math.max(...smaller) + RING_GAP_KM : RING_GAP_KM;
  const upper = larger.length ? Math.min(...larger) - RING_GAP_KM : Infinity;
  return Math.min(Math.max(radiusKm, lower), Math.max(lower, upper));
}

export function ZoneMap({
  apiKey,
  origin,
  zones,
  onRadiusChange,
  onRadiusCommit,
  onOriginChange,
}: {
  apiKey: string;
  origin: { lat: number; lng: number };
  zones: MapZone[];
  /** Fires continuously while a ring's resize handle is dragged, already clamped, in km. */
  onRadiusChange: (publicId: string, radiusKm: number) => void;
  /** Fires once when the drag ends — the point to persist. */
  onRadiusCommit: (publicId: string, radiusKm: number) => void;
  onOriginChange: (lat: number, lng: number) => void;
}) {
  const { isLoaded, loadError } = useLoadScript({ googleMapsApiKey: apiKey });
  // Google fires onRadiusChanged with no argument — the current radius has to
  // be read off the live Circle instance via its ref, one per zone.
  const circleRefs = useRef(new Map<string, google.maps.Circle>());

  const handleRadiusChanged = useCallback(
    (zone: MapZone) => {
      const circle = circleRefs.current.get(zone.publicId);
      if (!circle) return;
      const meters = circle.getRadius();
      const clampedKm = clampRadiusKm(meters / 1000, zones, zone.publicId);
      // Snap the circle itself back to the clamped value so the drag handle
      // can't visually sit past a neighbour while the mouse is still down.
      circle.setRadius(clampedKm * 1000);
      onRadiusChange(zone.publicId, clampedKm);
    },
    [zones, onRadiusChange],
  );

  if (loadError) {
    return (
      <div className="text-destructive flex h-full min-h-[420px] items-center justify-center rounded-lg border p-6 text-center text-sm">
        Google Maps failed to load. Check NEXT_PUBLIC_GOOGLE_MAPS_KEY.
      </div>
    );
  }
  if (!isLoaded) {
    return <Skeleton className="min-h-[420px] w-full rounded-lg" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border" style={{ minHeight: 420 }}>
      <GoogleMap mapContainerStyle={CONTAINER_STYLE} center={origin} zoom={11}>
        <Marker
          position={origin}
          draggable
          onDragEnd={(e) => {
            if (e.latLng) onOriginChange(e.latLng.lat(), e.latLng.lng());
          }}
        />
        {zones
          .filter((z) => z.active)
          .map((z) => (
            <Circle
              key={z.publicId}
              center={origin}
              radius={z.radiusKm * 1000}
              editable
              draggable={false}
              options={{ fillColor: z.color, fillOpacity: 0.15, strokeColor: z.color, strokeWeight: 2 }}
              onLoad={(circle) => circleRefs.current.set(z.publicId, circle)}
              onUnmount={() => circleRefs.current.delete(z.publicId)}
              onRadiusChanged={() => handleRadiusChanged(z)}
              onMouseUp={() => {
                const circle = circleRefs.current.get(z.publicId);
                if (circle) onRadiusCommit(z.publicId, circle.getRadius() / 1000);
              }}
            />
          ))}
      </GoogleMap>
    </div>
  );
}
