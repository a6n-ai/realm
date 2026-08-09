"use client";

import { useEffect, useRef, useState } from "react";
// Pinned to maplibre-gl v5 — see zone-map.tsx for why (v6's worker loading
// breaks under Next's bundler). Same import-by-name, same dynamic-import,
// same styledata-not-load gating; this is a read-only sibling of that map.
import type { MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";

/** Same-origin basemap proxy — signs Amazon Location server-side and falls back
 *  to OpenStreetMap by itself, so this file needs no style config. */
const MAP_STYLE_URL = "/api/map/style";

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
    const placedMarkers: MapLibreMarker[] = [];

    void (async () => {
      try {
        const { MapLibreMap: MapCtor, Marker, Popup, NavigationControl } = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        const instance = new MapCtor({
          container: containerRef.current,
          style: MAP_STYLE_URL,
          center: [center.lng, center.lat],
          zoom,
          attributionControl: { compact: true },
        });
        map = instance;
        instance.addControl(new NavigationControl({ showCompass: false }), "top-right");
        instance.on("error", () => setFailed(true));

        // Gate on style readiness, not "load" — with a remote raster basemap
        // "load" may never fire. See zone-map.tsx for the production incident.
        // styledata fires repeatedly, so this must be idempotent — without the
        // guard every event appends another set of markers on top of the last.
        let placed = false;
        const init = () => {
          if (cancelled || placed) return;
          placed = true;
          for (const m of markers) {
            const marker = new Marker({ color: m.color ?? "#111" }).setLngLat([m.lng, m.lat]);
            if (m.title) marker.setPopup(new Popup({ closeButton: false, offset: 24 }).setText(m.title));
            marker.addTo(instance);
            placedMarkers.push(marker);
          }
          // Frame every marker rather than trusting `zoom`. A fixed zoom around
          // the midpoint puts both pins off-screen as soon as they are a few km
          // apart — the map then shows anonymous streets between two points you
          // cannot see, which is worse than no map at all.
          if (markers.length > 1) {
            const lats = markers.map((m) => m.lat);
            const lngs = markers.map((m) => m.lng);
            instance.fitBounds(
              [
                [Math.min(...lngs), Math.min(...lats)],
                [Math.max(...lngs), Math.max(...lats)],
              ],
              { padding: 56, duration: 0, maxZoom: zoom },
            );
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
      placedMarkers.forEach((m) => m.remove());
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
