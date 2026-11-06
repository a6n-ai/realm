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

type Box = { l: number; r: number; t: number; b: number };
const GAP = 10; // dot centre to label edge
// Chip sizes: 12px names on desktop, 11px compact chips on phones (see .tg-smap--compact).
const CHIP = { regular: { charW: 7.4, pad: 22, h: 27 }, compact: { charW: 6.8, pad: 18, h: 25 } };
type Chip = (typeof CHIP)["regular"];
const labelBox = (p: { name: string; x: number; y: number }, side: "top" | "bottom", c: Chip): Box => {
  const w = p.name.length * c.charW + c.pad;
  const t = side === "top" ? p.y - GAP - c.h : p.y + GAP;
  return { l: p.x - w / 2, r: p.x + w / 2, t, b: t + c.h };
};
const hits = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

/** Each name sits above its dot unless that would overlap a name already placed (or another dot);
 *  then below; with no room on either side it hides (its area chip still lights it). Top-down, so the
 *  higher dot keeps the top spot. */
export function placeLabels(points: { name: string; x: number; y: number }[], compact = false): ("top" | "bottom" | "none")[] {
  const chip = compact ? CHIP.compact : CHIP.regular;
  const order = points.map((p, i) => ({ p, i })).sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x);
  const placed: Box[] = [];
  const dots: Box[] = points.map((p) => ({ l: p.x - 9, r: p.x + 9, t: p.y - 9, b: p.y + 9 }));
  const out: ("top" | "bottom" | "none")[] = new Array(points.length);
  for (const { p, i } of order) {
    const clear = (box: Box) => !placed.some((q) => hits(box, q)) && !dots.some((d, j) => j !== i && hits(box, d));
    const top = labelBox(p, "top", chip);
    const bottom = labelBox(p, "bottom", chip);
    const side = clear(top) ? "top" : clear(bottom) ? "bottom" : "none";
    out[i] = side;
    if (side !== "none") placed.push(side === "top" ? top : bottom);
  }
  return out;
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
    <div ref={box} className={`tg-deliver__map tg-smap${size && !size.wide ? " tg-smap--compact" : ""}`} role="img" aria-label={`Map of the areas we deliver to: ${places.map((p) => p.name).join(", ")}`}>
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
          {(() => {
            const pts = places.map((p) => ({ name: p.name, ...cam.at(p.point) }));
            const sides = placeLabels(pts, !size.wide);
            return places.map((p, i) => {
            const q = pts[i]!;
            return (
              <span key={p.name} className="tg-area tg-smap__mark" data-on={String(p.name === focus)} data-side={sides[i]} title={p.name} style={{ left: q.x, top: q.y }}>
                <i /><b>{p.name}</b>
              </span>
            );
            });
          })()}
          {pin ? (() => { const q = cam.at(pin); return <span className="tg-pin tg-smap__mark" data-served={String(pin.served)} style={{ left: q.x, top: q.y }} aria-hidden />; })() : null}
          <small className="tg-smap__credit">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors</small>
        </>
      ) : null}
    </div>
  );
}
