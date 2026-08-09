"use client";

import { useEffect, useRef, useState } from "react";
// Pinned to maplibre-gl v5, deliberately — do not bump to v6 without testing a
// production build. v6 loads its worker as a separate file via
// `new Worker(new URL("./maplibre-gl-worker.mjs", import.meta.url))`, and under
// Next's bundler import.meta.url resolves to the built chunk, where that sibling
// does not exist. The worker then silently never starts: raster tiles still
// paint (main thread) but every GeoJSON source stays unloaded, so the zone rings
// vanish with no error, no failed request, and isStyleLoaded() stuck false.
// v5 inlines the worker as a blob and is bundler-agnostic.
//
// Imported by name (both versions export these); `Map` would shadow the global
// Map used for the marker registry below, hence the MapLibreMap alias.
import type { MapLibreMap, Marker as MapLibreMarker, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Skeleton } from "@realm/ui/skeleton";
import { destinationPoint, haversineKm } from "@/lib/delivery/distance";

const RING_GAP_KM = 0.01;
/** Points per ring. 96 is smooth at every zoom the admin map allows without
 *  making the GeoJSON payload worth thinking about. */
const RING_STEPS = 96;
/** Bearing the resize handle sits on. East keeps it clear of the zone label. */
const HANDLE_BEARING = 90;

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

/**
 * A zone ring as a GeoJSON polygon. MapLibre has no circle primitive — unlike
 * Google's <Circle>, which is why this file is hand-rolled rather than a
 * like-for-like port. Built from destinationPoint so the drawn ring and the
 * server's haversine distance check agree on the same globe.
 */
export function ringPolygon(
  center: { lat: number; lng: number },
  radiusKm: number,
  steps = RING_STEPS,
): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const p = destinationPoint(center.lat, center.lng, radiusKm, (i * 360) / steps);
    coords.push([p.lng, p.lat]);
  }
  return coords;
}

function zonesToGeoJson(
  origin: { lat: number; lng: number },
  zones: MapZone[],
  focusedPublicId: string | null,
) {
  // Largest first so smaller rings paint on top and stay clickable — fills are
  // translucent and later layers win the pointer.
  const ordered = [...zones].filter((z) => z.active).sort((a, b) => b.radiusKm - a.radiusKm);
  return {
    type: "FeatureCollection" as const,
    features: ordered.map((z) => ({
      type: "Feature" as const,
      properties: {
        publicId: z.publicId,
        name: z.name,
        color: z.color,
        // Drives the paint expressions rather than a second layer: one source
        // means the emphasis can never drift out of sync with the geometry.
        focused: focusedPublicId != null && z.publicId === focusedPublicId,
      },
      geometry: { type: "Polygon" as const, coordinates: [ringPolygon(origin, z.radiusKm)] },
    })),
  };
}

/** Keyless raster basemap. Works with no credential and no AWS grant, which is
 *  what makes the map render at all today. Swapped for Amazon Location vector
 *  tiles by setting NEXT_PUBLIC_MAP_STYLE_URL — see the styleUrl prop. */
const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export function ZoneMap({
  origin,
  zones,
  onRadiusChange,
  onRadiusCommit,
  onOriginChange,
  styleUrl = null,
  focusedPublicId = null,
}: {
  origin: { lat: number; lng: number };
  zones: MapZone[];
  /** Fires continuously while a ring's resize handle is dragged, already clamped, in km. */
  onRadiusChange: (publicId: string, radiusKm: number) => void;
  /** Fires once when the drag ends — the point to persist. */
  onRadiusCommit: (publicId: string, radiusKm: number) => void;
  onOriginChange: (lat: number, lng: number) => void;
  /** Vector style URL (Amazon Location, proxied same-origin). Null = keyless OSM raster. */
  styleUrl?: string | null;
  /** Ring to emphasise and zoom to — set when a row in the table is selected. */
  focusedPublicId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const originMarkerRef = useRef<MapLibreMarker | null>(null);
  const handleMarkersRef = useRef(new Map<string, MapLibreMarker>());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // MapLibre event handlers are registered once against a live map instance, so
  // they would capture the first render's props forever. Everything they read
  // goes through this ref instead.
  const latest = useRef({ origin, zones, onRadiusChange, onRadiusCommit, onOriginChange, focusedPublicId });
  // Written in an effect, not during render: a render-phase ref write is unsafe
  // under concurrent rendering, where a render can be discarded before commit.
  // Declared before the map effect so the first commit populates it first.
  useEffect(() => {
    latest.current = { origin, zones, onRadiusChange, onRadiusCommit, onOriginChange, focusedPublicId };
  });

  // Map creation, once. maplibre-gl touches `window` at import time, so it is
  // imported here rather than at module scope — this component is rendered on
  // the server for its initial HTML like any other client component.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;

    void (async () => {
      try {
        const { MapLibreMap: MapCtor, Marker, NavigationControl } = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        const instance = new MapCtor({
          container: containerRef.current,
          style: styleUrl ?? OSM_STYLE,
          center: [latest.current.origin.lng, latest.current.origin.lat],
          zoom: 11,
          attributionControl: { compact: true },
        });
        map = instance;
        mapRef.current = instance;
        instance.addControl(new NavigationControl({ showCompass: false }), "top-right");
        instance.on("error", () => setFailed(true));

        // Gate on the STYLE being ready, not the map's "load" event. `load`
        // waits for every source and tile to settle, and with a remote raster
        // basemap it may never fire — observed in production: isStyleLoaded()
        // true, tiles painting, loaded() stuck false forever. The skeleton then
        // never lifts and the working map sits invisible underneath it.
        //
        // styledata fires more than once, so the getSource guard makes this
        // idempotent, and it is invoked directly when the style is already in.
        const initLayers = () => {
          if (cancelled || instance.getSource("zones")) return;
          instance.addSource("zones", {
            type: "geojson",
            data: zonesToGeoJson(
              latest.current.origin,
              latest.current.zones,
              latest.current.focusedPublicId,
            ),
          });
          instance.addLayer({
            id: "zones-fill",
            type: "fill",
            source: "zones",
            paint: {
              "fill-color": ["get", "color"],
              "fill-opacity": ["case", ["get", "focused"], 0.3, 0.12],
            },
          });
          instance.addLayer({
            id: "zones-line",
            type: "line",
            source: "zones",
            paint: {
              "line-color": ["get", "color"],
              "line-width": ["case", ["get", "focused"], 3.5, 1.5],
            },
          });

          const originMarker = new Marker({ draggable: true, color: "#111" })
            .setLngLat([latest.current.origin.lng, latest.current.origin.lat])
            .addTo(instance);
          originMarker.on("dragend", () => {
            const { lng, lat } = originMarker.getLngLat();
            latest.current.onOriginChange(lat, lng);
          });
          originMarkerRef.current = originMarker;

          setReady(true);
        };

        if (instance.isStyleLoaded()) initLayers();
        instance.on("styledata", initLayers);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    const handles = handleMarkersRef.current;
    return () => {
      cancelled = true;
      handles.forEach((m) => m.remove());
      handles.clear();
      originMarkerRef.current?.remove();
      originMarkerRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
    // styleUrl is deployment config, not reactive state — rebuilding the map on
    // a change to it is not a case that occurs at runtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw rings and reposition handles whenever the zones or the origin move.
  // This is also what pulls the map back in line after a number-input edit —
  // the input stays the authoritative control, the map follows it.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const source = map.getSource("zones");
    if (source && "setData" in source) {
      (source as { setData: (d: unknown) => void }).setData(
        zonesToGeoJson(origin, zones, focusedPublicId),
      );
    }
    originMarkerRef.current?.setLngLat([origin.lng, origin.lat]);

    void (async () => {
      const { Marker } = await import("maplibre-gl");
      const live = new Set<string>();

      for (const zone of zones.filter((z) => z.active)) {
        live.add(zone.publicId);
        const at = destinationPoint(origin.lat, origin.lng, zone.radiusKm, HANDLE_BEARING);
        const existing = handleMarkersRef.current.get(zone.publicId);

        if (existing) {
          existing.setLngLat([at.lng, at.lat]);
        } else {
          const el = document.createElement("button");
          el.type = "button";
          el.className = "zone-handle";
          el.style.cssText = `width:14px;height:14px;border-radius:9999px;border:2px solid #fff;background:${zone.color};box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:ew-resize;padding:0`;
          // The number input is the accessible control for radius; this handle
          // is a pointer-only convenience and must not become a tab stop that
          // does nothing on Enter.
          el.tabIndex = -1;
          el.setAttribute("aria-hidden", "true");
          el.title = `Drag to resize ${zone.name}`;

          const marker = new Marker({ element: el, draggable: true })
            .setLngLat([at.lng, at.lat])
            .addTo(map);

          const publicId = zone.publicId;
          marker.on("drag", () => {
            const m = handleMarkersRef.current.get(publicId);
            if (!m) return;
            const { lng, lat } = m.getLngLat();
            const o = latest.current.origin;
            const clamped = clampRadiusKm(
              haversineKm(o.lat, o.lng, lat, lng),
              latest.current.zones,
              publicId,
            );
            // Snap the handle back onto its bearing at the clamped radius so it
            // cannot visually sit past a neighbour while the mouse is still down.
            const snapped = destinationPoint(o.lat, o.lng, clamped, HANDLE_BEARING);
            m.setLngLat([snapped.lng, snapped.lat]);
            latest.current.onRadiusChange(publicId, clamped);
          });
          marker.on("dragend", () => {
            const m = handleMarkersRef.current.get(publicId);
            if (!m) return;
            const { lng, lat } = m.getLngLat();
            const o = latest.current.origin;
            latest.current.onRadiusCommit(
              publicId,
              clampRadiusKm(haversineKm(o.lat, o.lng, lat, lng), latest.current.zones, publicId),
            );
          });

          handleMarkersRef.current.set(zone.publicId, marker);
        }
      }

      // Drop handles for zones that were deactivated or deleted.
      for (const [publicId, marker] of handleMarkersRef.current) {
        if (!live.has(publicId)) {
          marker.remove();
          handleMarkersRef.current.delete(publicId);
        }
      }
    })();
  }, [ready, origin, zones, focusedPublicId]);

  // Zoom to the selected ring. Bounds come from the ring's own cardinal points
  // rather than a fixed zoom, so a 3 km and a 20 km zone both land framed.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focusedPublicId) return;
    const zone = zones.find((z) => z.publicId === focusedPublicId && z.active);
    if (!zone) return;

    const north = destinationPoint(origin.lat, origin.lng, zone.radiusKm, 0);
    const east = destinationPoint(origin.lat, origin.lng, zone.radiusKm, 90);
    const south = destinationPoint(origin.lat, origin.lng, zone.radiusKm, 180);
    const west = destinationPoint(origin.lat, origin.lng, zone.radiusKm, 270);
    map.fitBounds(
      [
        [west.lng, south.lat],
        [east.lng, north.lat],
      ],
      { padding: 48, duration: 600 },
    );
  }, [ready, focusedPublicId, origin, zones]);

  if (failed) {
    return (
      <div className="text-muted-foreground flex h-full min-h-[420px] items-center justify-center rounded-lg border p-6 text-center text-sm">
        The map could not be loaded. Every value below is still editable without it.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border" style={{ minHeight: 420 }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 420 }} />
      {!ready && <Skeleton className="absolute inset-0 min-h-[420px] w-full rounded-lg" />}
    </div>
  );
}
