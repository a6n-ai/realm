"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { afterFirstInput } from "@/lib/landing/wake";
import { checkDelivery, type DeliveryCheck as Result } from "@/lib/landing/check-delivery";

type Point = { lat: number; lng: number };
type Area = { name: string; slotWindow: string | null; point: Point | null };
type Ring = { name: string; radiusKm: number };

const GTA: Point = { lat: 43.7, lng: -79.42 };
// A code further than this from the GTA gets no pin: the map stays on our areas.
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
  layers: [{ id: "osm", type: "raster" as const, source: "osm", paint: { "raster-saturation": -0.9, "raster-brightness-min": 0.08, "raster-contrast": -0.15 } }],
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

export function DeliveryCheck({ origin, rings, areas }: { origin: Point | null; rings: Ring[]; areas: Area[] }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const pin = useRef<Marker | null>(null);
  const dots = useRef(new Map<string, HTMLElement>());
  const lib = useRef<typeof import("maplibre-gl") | null>(null);

  const placed = areas.filter((a): a is Area & { point: Point } => a.point != null);

  // Desktop leaves room for the floating panel on the left; phones stack it below.
  const padding = () => (matchMedia("(min-width: 901px)").matches ? { top: 56, bottom: 56, left: 440, right: 56 } : { top: 36, bottom: 36, left: 36, right: 36 });

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
      const ml = await import("maplibre-gl");
      if (cancelled) return;
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
    pin.current?.remove();
    pin.current = null;
    if (!m || !ml || !result || !("point" in result) || !result.point) return;
    if (km(result.point, origin ?? GTA) > NEAR_KM) return frame(m);
    const el = document.createElement("span");
    el.className = "tg-pin";
    el.dataset.served = String(result.status === "served");
    pin.current = new ml.Marker({ element: el }).setLngLat([result.point.lng, result.point.lat]).addTo(m);
    if (result.status === "served") m[reduced() ? "jumpTo" : "flyTo"]({ center: [result.point.lng, result.point.lat], zoom: 12, padding: padding() });
    else frame(m, result.point);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await checkDelivery(value);
      setResult(r);
      setFocus(r.status === "served" ? (r.zone?.name ?? null) : null);
    });
  };

  const showArea = (a: Area) => {
    setFocus(a.name);
    const m = map.current;
    if (m && a.point) m[reduced() ? "jumpTo" : "flyTo"]({ center: [a.point.lng, a.point.lat], zoom: 11.5, padding: padding() });
  };

  const verdict =
    result?.status === "invalid" ? { tone: "info", title: "That is not a full postal code.", body: "Use all six characters, like M5V 2T6." }
    : result?.status === "busy" ? { tone: "info", title: "One moment.", body: "Too many checks in a minute. Try again shortly." }
    : result?.status === "served" ? { tone: "yes", title: `Yes, we deliver to ${result.postalCode}.`, body: `${result.zone?.name ?? "Your area"}${result.zone?.slotWindow ? `, delivered ${result.zone.slotWindow}` : ""}.` }
    : result?.status === "not_served" ? { tone: "no", title: `Not yet at ${result.postalCode}.`, body: "We are adding areas across the GTA. Tell us where you are and we will write when we reach you." }
    : null;

  return (
    <div className="tg-card tg-deliver">
      <div ref={box} className="tg-deliver__map" role="region" aria-label="Map of the areas we deliver to" />
      <div className="tg-deliver__panel">
        <form className="tg-deliver__form" onSubmit={submit}>
          <label htmlFor="tg-postal" className="tg-deliver__label">Your postal code</label>
          <div className="flex gap-2">
            <input
              id="tg-postal"
              className="tg-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="M5V 2T6"
              autoComplete="postal-code"
              maxLength={7}
              spellCheck={false}
            />
            <button type="submit" className="tg-cta" disabled={pending || value.replace(/\s/g, "").length < 6}>
              {pending ? "Checking" : "Check"}
            </button>
          </div>
        </form>
        <div aria-live="polite">
          {verdict ? (
            <div className="tg-verdict" data-tone={verdict.tone}>
              <strong>{verdict.title}</strong>
              <span>{verdict.body}</span>
              {verdict.tone === "yes" ? <Link prefetch={false} href="/subscribe" className="tg-link tg-link--tap">Build my tiffin</Link> : null}
              {verdict.tone === "no" ? <Link href="/contact" className="tg-link tg-link--tap">Ask us about your area</Link> : null}
            </div>
          ) : null}
        </div>
        {areas.length > 0 ? (
          <div className="tg-deliver__areas">
            <span className="tg-deliver__label">Where we deliver</span>
            <ul>
              {areas.map((a) => (
                <li key={a.name}>
                  <button type="button" className="tg-chip" aria-pressed={focus === a.name} onClick={() => showArea(a)} disabled={!a.point}>
                    {a.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
