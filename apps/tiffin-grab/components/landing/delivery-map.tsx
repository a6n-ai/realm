"use client";

import { useEffect, useRef } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { afterFirstInput } from "@/lib/landing/wake";

const MAPLIBRE_WORKER = "/vendor/maplibre-gl-worker-6.15.0.mjs";

type Point = { lat: number; lng: number };
type Area = { name: string; slotWindow: string | null; point: Point | null };
type Ring = { name: string; radiusKm: number };
export type DeliveryPin = { lat: number; lng: number; served: boolean } | null;
export type DeliveryCamera = { point: Point; n: number } | null;

const GTA: Point = { lat: 43.7, lng: -79.42 };
const NEAR_KM = 120;

// Keyless OSM raster, greyed to sit on the cream page. The Amazon Location proxy
// under /api/map is session-only, so the public map does not use it.
const STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  // Raster tiles bake the city names in, so pins always landed on them. Washing the tiles
  // over cream pushes those names back; the pins and our own name chips lead.
  layers: [
    { id: "cream", type: "background" as const, paint: { "background-color": "#FBF4E7" } },
    { id: "osm", type: "raster" as const, source: "osm", paint: { "raster-saturation": -1, "raster-brightness-min": 0.1, "raster-contrast": -0.25, "raster-opacity": 0.55 } },
  ],
};

const km = (a: Point, b: Point) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

function ring(center: Point, radius: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([center.lng + (radius / (111.32 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(a), center.lat + (radius / 110.57) * Math.cos(a)]);
  }
  return pts;
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Desktop leaves room for the floating panel on the left; phones stack it below.
const padding = () => (matchMedia("(min-width: 901px)").matches ? { top: 56, bottom: 56, left: 440, right: 56 } : { top: 36, bottom: 36, left: 36, right: 36 });

// MapLibre stays in this module. The parent loads it with next/dynamic and
// ssr: false, so the server Worker does not compile the library.
export function DeliveryMap({
  origin,
  rings,
  areas,
  focus,
  pin,
  camera,
}: {
  origin: Point | null;
  rings: Ring[];
  areas: Area[];
  focus: string | null;
  pin: DeliveryPin;
  camera: DeliveryCamera;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const dots = useRef(new Map<string, HTMLElement>());
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const placed = areas.filter((a): a is Area & { point: Point } => a.point != null);

  const frame = (m: MapLibreMap, extra?: Point) => {
    const ml = lib.current;
    const pts = [...placed.map((a) => a.point), ...(extra ? [extra] : [])];
    if (!ml || pts.length === 0) return;
    const b = new ml.LngLatBounds();
    pts.forEach((p) => b.extend([p.lng, p.lat]));
    m.fitBounds(b, { padding: padding(), maxZoom: 12, duration: reduced() ? 0 : 1200 });
  };

  // The map library is ~200 KB; load it only when the card scrolls near.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let cancelled = false;
    const markers = dots.current;
    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry?.isIntersecting) return;
      io.disconnect();
      // The map library is heavy to start; wait for a first input or an idle moment.
      await afterFirstInput();
      if (cancelled) return;
      // Map CSS loads with the map, not with the page: it was 70KB of render-blocking CSS.
      const [ml] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]);
      if (cancelled) return;
      // MapLibre looks for its worker beside its own chunk, which the bundler never emits, so
      // tiles never loaded ("Worker failed to load"). Serve a copy from public/ instead; the
      // version in the name must match package.json (re-copy from node_modules/maplibre-gl/dist on upgrade).
      ml.setWorkerUrl(MAPLIBRE_WORKER);
      lib.current = ml;
      const center = origin ?? GTA;
      const m = new ml.Map({ container: el, style: STYLE, center: [center.lng, center.lat], zoom: 9, attributionControl: { compact: true },
        // Scrolling the page past the map must never zoom or dim it; zoom is the buttons
        // or a pinch, and phones keep one-finger page scroll.
        scrollZoom: false, dragRotate: false, pitchWithRotate: false, dragPan: !matchMedia("(pointer: coarse)").matches,
      });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      map.current = m;
      for (const a of placed) {
        const dot = document.createElement("span");
        dot.className = "tg-area";
        dot.title = a.name;
        const label = document.createElement("b");
        label.textContent = a.name;
        dot.append(document.createElement("i"), label);
        new ml.Marker({ element: dot }).setLngLat([a.point.lng, a.point.lat]).addTo(m);
        markers.set(a.name, dot);
      }
      m.on("load", () => {
        frame(m);
        if (!origin || rings.length === 0) return;
        m.addSource("rings", {
          type: "geojson",
          data: { type: "FeatureCollection", features: rings.map((r) => ({ type: "Feature", properties: { name: r.name }, geometry: { type: "Polygon", coordinates: [ring(origin, r.radiusKm)] } })) },
        });
        const saffron = getComputedStyle(el).getPropertyValue("--primary").trim() || "#F06B1A";
        m.addLayer({ id: "rings-fill", type: "fill", source: "rings", paint: { "fill-color": saffron, "fill-opacity": 0.07 } });
        m.addLayer({ id: "rings-line", type: "line", source: "rings", paint: { "line-color": saffron, "line-width": 1.5 } });
      });
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); markers.clear(); map.current?.remove(); map.current = null; };
    // placed derives from areas; the map is built once per props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, rings, areas]);

  // One area lit at a time: the one a chip picked, or the one a check matched.
  useEffect(() => {
    for (const [name, el] of dots.current) el.dataset.on = String(name === focus);
  }, [focus]);

  // Pin the checked code when it is near; a far code leaves the map on our areas.
  useEffect(() => {
    const m = map.current, ml = lib.current;
    marker.current?.remove();
    marker.current = null;
    if (!m || !ml || !pin) return;
    if (km(pin, origin ?? GTA) > NEAR_KM) return frame(m);
    const el = document.createElement("span");
    el.className = "tg-pin";
    el.dataset.served = String(pin.served);
    marker.current = new ml.Marker({ element: el }).setLngLat([pin.lng, pin.lat]).addTo(m);
    if (pin.served) m[reduced() ? "jumpTo" : "flyTo"]({ center: [pin.lng, pin.lat], zoom: 12, padding: padding() });
    else frame(m, pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  // A chip click asks the map to move. `n` changes even when the point does not.
  useEffect(() => {
    const m = map.current;
    if (!m || !camera) return;
    m[reduced() ? "jumpTo" : "flyTo"]({ center: [camera.point.lng, camera.point.lat], zoom: 11.5, padding: padding() });
  }, [camera]);

  return <div ref={box} className="tg-deliver__map" role="region" aria-label="Map of the areas we deliver to" />;
}
