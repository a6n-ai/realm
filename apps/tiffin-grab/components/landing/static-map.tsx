"use client";

import { useEffect, useRef, useState } from "react";

// The delivery map as plain images: OpenStreetMap tiles in <img> tags, our rings in an SVG and
// our areas as positioned dots. No WebGL and no map library, so a phone pays for a few PNGs,
// not a GPU context (MapLibre on the home page was a suspect in iOS Safari tab crashes).
// It does not pan or zoom: it frames our areas once, and again when a checked code adds a pin.

export type Point = { lat: number; lng: number };
type Ring = { name: string; radiusKm: number };
type Place = { name: string; point: Point };

const TILE = 256;
const MAX_ZOOM = 12;
const MIN_ZOOM = 7;

// Web Mercator, in pixels at zoom 0.
const world = (p: Point) => {
  const s = Math.sin((p.lat * Math.PI) / 180);
  return { x: (TILE * (p.lng + 180)) / 360, y: TILE * (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) };
};

function ring(center: Point, radius: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push({ lng: center.lng + (radius / (111.32 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(a), lat: center.lat + (radius / 110.57) * Math.cos(a) });
  }
  return pts;
}

// Desktop leaves room for the floating panel on the left; phones stack it below.
const padOf = (wide: boolean) => (wide ? { top: 56, bottom: 56, left: 440, right: 56 } : { top: 36, bottom: 36, left: 36, right: 36 });

/** The camera that fits `pts` inside the box minus padding, at a whole zoom so tiles stay crisp. */
export function fit(pts: Point[], w: number, h: number, wide = w > 900) {
  const pad = padOf(wide);
  const ws = pts.map(world);
  const minX = Math.min(...ws.map((p) => p.x)), maxX = Math.max(...ws.map((p) => p.x));
  const minY = Math.min(...ws.map((p) => p.y)), maxY = Math.max(...ws.map((p) => p.y));
  const availW = Math.max(w - pad.left - pad.right, 80), availH = Math.max(h - pad.top - pad.bottom, 80);
  const zx = maxX > minX ? Math.log2(availW / (maxX - minX)) : MAX_ZOOM;
  const zy = maxY > minY ? Math.log2(availH / (maxY - minY)) : MAX_ZOOM;
  const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(Math.min(zx, zy))));
  const k = 2 ** z;
  // The middle of the points lands in the middle of the padded area.
  const ox = pad.left + availW / 2 - ((minX + maxX) / 2) * k;
  const oy = pad.top + availH / 2 - ((minY + maxY) / 2) * k;
  return { z, at: (p: Point) => { const q = world(p); return { x: q.x * k + ox, y: q.y * k + oy }; }, ox, oy };
}

export function StaticMap({ origin, rings, places, focus, pin }: {
  origin: Point | null;
  rings: Ring[];
  places: Place[];
  focus: string | null;
  pin: (Point & { served: boolean }) | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number; wide: boolean } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e!.contentRect;
      const wide = matchMedia("(min-width: 901px)").matches;
      setSize((s) => (s && s.wide === wide && Math.abs(s.w - width) < 1 && Math.abs(s.h - height) < 1 ? s : { w: Math.round(width), h: Math.round(height), wide }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = [...places.map((p) => p.point), ...(pin ? [pin] : [])];
  const cam = size && pts.length ? fit(pts, size.w, size.h, size.wide) : null;

  const tiles: { key: string; src: string; left: number; top: number }[] = [];
  if (cam && size) {
    const n = 2 ** cam.z;
    for (let ty = Math.floor(-cam.oy / TILE); ty <= Math.floor((size.h - cam.oy) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(-cam.ox / TILE); tx <= Math.floor((size.w - cam.ox) / TILE); tx++) {
        const x = ((tx % n) + n) % n;
        tiles.push({ key: `${cam.z}/${tx}/${ty}`, src: `https://tile.openstreetmap.org/${cam.z}/${x}/${ty}.png`, left: tx * TILE + cam.ox, top: ty * TILE + cam.oy });
      }
    }
  }

  return (
    <div ref={box} className="tg-deliver__map tg-smap" role="img" aria-label={`Map of the areas we deliver to: ${places.map((p) => p.name).join(", ")}`}>
      {cam && size ? (
        <>
          <div className="tg-smap__tiles" aria-hidden>
            {tiles.map((t) => (
              // eslint-disable-next-line @next/next/no-img-element -- third-party map tiles, not our images
              <img key={t.key} src={t.src} alt="" width={TILE} height={TILE} loading="lazy" decoding="async" draggable={false} style={{ left: t.left, top: t.top }} />
            ))}
          </div>
          {origin && rings.length ? (
            <svg className="tg-smap__rings" width={size.w} height={size.h} aria-hidden>
              {rings.map((r) => (
                <polygon key={r.name} points={ring(origin, r.radiusKm).map((p) => { const q = cam.at(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(" ")} />
              ))}
            </svg>
          ) : null}
          {places.map((p) => {
            const q = cam.at(p.point);
            return (
              <span key={p.name} className="tg-area tg-smap__mark" data-on={String(p.name === focus)} title={p.name} style={{ left: q.x, top: q.y }}>
                <i /><b>{p.name}</b>
              </span>
            );
          })}
          {pin ? (() => { const q = cam.at(pin); return <span className="tg-pin tg-smap__mark" data-served={String(pin.served)} style={{ left: q.x, top: q.y }} aria-hidden />; })() : null}
          <small className="tg-smap__credit">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors</small>
        </>
      ) : null}
    </div>
  );
}
