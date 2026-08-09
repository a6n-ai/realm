"use client";

import { useEffect, useRef, useState } from "react";
// Pinned to maplibre-gl v5 — see zone-map.tsx for why (v6's worker loading
// breaks under Next's bundler). Same import-by-name, same dynamic-import,
// same styledata-not-load gating; this is a read-only sibling of that map.
import type { MapLibreMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/** Keyless raster basemap — copied from zone-map.tsx, attribution required by
 *  OSM's usage policy. */
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

export type StaticMapMarker = { lat: number; lng: number; color?: string; title?: string };

/** Read-only MapLibre display for the public site — pin(s) only, no drag
 *  handles, no editing. Used at checkout (origin + resolved address) and on
 *  the contact page (single shop pin). */
export function StaticMap({
  center,
  markers = [],
  zoom = 13,
  className,
  heightPx = 280,
}: {
  center: { lat: number; lng: number };
  markers?: StaticMapMarker[];
  zoom?: number;
  className?: string;
  heightPx?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // No drag handles or callbacks to keep current across renders, so — unlike
  // zone-map.tsx — there's no `latest` ref: markers/center are read once at
  // mount. Callers that need a different view remount via a `key`.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;

    void (async () => {
      try {
        const { MapLibreMap: MapCtor, Marker, Popup, NavigationControl } = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        const instance = new MapCtor({
          container: containerRef.current,
          style: OSM_STYLE,
          center: [center.lng, center.lat],
          zoom,
          attributionControl: { compact: true },
        });
        map = instance;
        instance.addControl(new NavigationControl({ showCompass: false }), "top-right");
        instance.on("error", () => setFailed(true));

        // Gate on style readiness, not "load" — with a remote raster basemap
        // "load" may never fire. See zone-map.tsx for the production incident.
        const init = () => {
          if (cancelled) return;
          for (const m of markers) {
            const marker = new Marker({ color: m.color ?? "#111" }).setLngLat([m.lng, m.lat]);
            if (m.title) marker.setPopup(new Popup({ closeButton: false, offset: 24 }).setText(m.title));
            marker.addTo(instance);
          }
          setReady(true);
        };

        if (instance.isStyleLoaded()) init();
        instance.on("styledata", init);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    return (
      <div
        className={className}
        style={{
          height: heightPx,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          fontWeight: 600,
          fontSize: "0.86rem",
          padding: 16,
          border: "var(--border)",
          borderRadius: 10,
          background: "var(--cream)",
        }}
      >
        Map couldn&apos;t load — see the address above.
      </div>
    );
  }

  return (
    <div className={className} style={{ position: "relative", overflow: "hidden", height: heightPx }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {!ready && (
        <div aria-hidden="true" className="skeleton" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
      )}
    </div>
  );
}
