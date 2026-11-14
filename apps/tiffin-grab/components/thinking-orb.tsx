import type { CSSProperties } from "react";

// The thinking orb: a sphere of dots that turns. Real CSS 3D: every dot sits on the sphere
// (rotateY/rotateX/translateZ) and the whole globe spins with one transform animation, so the
// compositor turns it: it moves from the first paint, before any script, and keeps turning while the
// browser is busy unloading one page or hydrating the next (a canvas loop stalled there). Dots near
// the edge foreshorten like a real globe; the far side shows through dimmer; a saffron band runs
// round the equator.

export const ORB_STEPS = ["Kitchen", "Cooking", "Tracking", "Delivery"] as const;

type Dot = { lon: number; lat: number; band: boolean };

// latitude rings, each with dots spaced evenly; alternate rings staggered so the surface reads as dots
function sphereDots(rings: number): Dot[] {
  const out: Dot[] = [];
  for (let k = 0; k < rings; k++) {
    const lat = -90 + ((k + 0.5) / rings) * 180, n = Math.max(6, Math.round(rings * 2 * Math.cos((lat * Math.PI) / 180)));
    for (let j = 0; j < n; j++) out.push({ lon: ((j + (k % 2) * 0.5) / n) * 360, lat, band: Math.abs(lat) < 14 });
  }
  return out;
}
const DOTS = { lg: sphereDots(13), sm: sphereDots(8) };

/** `size` in px. `small` uses fewer, larger dots. `steps` cycles the four stages of an order under
 *  the orb (the splash). */
export function ThinkingOrb({ size, small = false, steps = false }: { size: number; small?: boolean; steps?: boolean }) {
  const dots = small ? DOTS.sm : DOTS.lg, r = size * 0.44;
  return (
    <span className="tg-orb-wrap" aria-hidden>
      <span className={small ? "tg-orb tg-orb--sm" : "tg-orb"} style={{ "--orb": `${size}px` } as CSSProperties}>
        <span className="tg-orb__tilt">
          <span className="tg-orb__globe">
            {dots.map((d, i) => (
              <i key={i} data-band={d.band || undefined} style={{ transform: `rotateY(${d.lon.toFixed(1)}deg) rotateX(${d.lat.toFixed(1)}deg) translateZ(${r.toFixed(1)}px)` }} />
            ))}
          </span>
        </span>
      </span>
      {steps && (
        <span className="tg-orb__steps">
          {ORB_STEPS.map((w) => <span key={w}>{w}</span>)}
        </span>
      )}
    </span>
  );
}
