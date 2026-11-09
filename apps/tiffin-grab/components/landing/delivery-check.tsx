"use client";

import { useState } from "react";
import Link from "next/link";
import { BuildTiffinLink } from "@/components/landing/build-tiffin-link";
import { RegionLegend, RegionMap, type MapDistrict, type Region } from "@foundry/region-map";
import { parseWindow } from "@/lib/landing/areas";
import { trackMeta } from "@foundry/meta-pixel/client";
import { sendMetaClientEvent } from "@/lib/meta/actions";

type Point = { lat: number; lng: number };
type Area = { name: string; slotWindow: string | null; group: number; point: Point | null };
type Ring = { name: string; radiusKm: number };

// Desktop keeps the floating panel's side of the map clear; phones stack the panel above.
// What the page lays over the map: the info panel (top-left) and the legend (bottom), kept clear of names.
const overlays = (w: number, h: number) => (w > 900 ? [{ l: 0, r: 320, t: 0, b: 150 }, { l: w - 700, r: w, t: h - 56, b: h }] : [{ l: 0, r: w - 60, t: 0, b: 116 }, { l: 0, r: w, t: h - 80, b: h }]);
const padFor = (w: number) => (w > 900 ? { top: 56, bottom: 72, left: 330, right: 72 } : { top: 124, bottom: 90, left: 24, right: 52 });

/** "Do we come to you?" in one tap: hovering or tapping a postal area reads out its zone and window;
 *  the legend lights one run. */
export function DeliveryCheck({ origin, rings, areas, region, districts, runs }: { origin: Point | null; rings: Ring[]; areas: Area[]; region: Region; districts: MapDistrict[]; runs: string[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [run, setRun] = useState<number | null>(null);
  const placed = areas.filter((a): a is Area & { point: Point } => a.point != null);
  const zoneOf = new Map(districts.map((d) => [d.id, areas.find((a) => a.name === d.place) ?? null]));
  const zone = picked ? (zoneOf.get(picked) ?? null) : null;
  // Hover reads out only until something is tapped; after that the panel holds the tapped area, so
  // the pointer can cross other areas on its way to the panel's link.
  const near = hover && !picked ? { id: hover, zone: zoneOf.get(hover) ?? null } : null;
  const active = zone?.group ?? run;

  const pick = (id: string) => {
    setPicked(id);
    setRun(null);
    const eventId = crypto.randomUUID();
    trackMeta("FindLocation", {}, eventId);
    void sendMetaClientEvent({
      eventName: "FindLocation",
      eventId,
      eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
    });
  };

  return (
    <div className="tg-card tg-deliver">
      {/* Small: what is under the pointer, or what was tapped. The legend on the map picks a run. */}
      <div className="tg-deliver__panel" aria-live="polite">
        {(() => {
          const id = near?.id ?? picked;
          const z = near ? near.zone : zone;
          if (!id) return <p className="tg-deliver__info m-0"><strong>Tap your area</strong><span>Its colour is the window your tiffin arrives in.</span></p>;
          return z ? (
            <p className="tg-deliver__info m-0" data-group={z.group}>
              <i aria-hidden /><strong>{id} · {z.name}</strong><span>{windowOf(z.slotWindow)}</span>
              {!near ? <BuildTiffinLink className="tg-link tg-link--tap">Start building your tiffin</BuildTiffinLink> : null}
            </p>
          ) : (
            <p className="tg-deliver__info m-0" data-tone="no">
              <strong>{id} · not yet</strong><span>We are adding areas across the GTA.</span>
              {!near ? <Link href="/contact" className="tg-link tg-link--tap">Ask about your area</Link> : null}
            </p>
          );
        })()}
      </div>
      <RegionMap
        className="tg-deliver__map"
        src="/landing/maps/gta.svg"
        region={region}
        places={placed.map((a) => ({ id: a.name, name: a.name, group: a.group, ...a.point }))}
        districts={districts}
        focus={zone?.name ?? null}
        picked={picked}
        onPick={pick}
        activeGroup={active}
        onHover={setHover}
        rings={origin ? rings.map((r) => ({ center: origin, radiusKm: r.radiusKm })) : []}
        pad={padFor}
        blocked={overlays}
        label={`Map of the areas we deliver to: ${placed.map((a) => a.name).join(", ")}. Tap an area to check it.`}
      >
        <RegionLegend groups={runs} active={active} onPick={(i) => { setPicked(null); setRun(run === i ? null : i); }} />
        {/* Required by the data licences: OpenStreetMap (ODbL) and Statistics Canada (OGL - Canada). */}
        <small className="rm-credit">© OpenStreetMap contributors, Statistics Canada</small>
      </RegionMap>
    </div>
  );
}

// "Delivered 11 AM to 2 PM": the stored slot text carries an en dash, which public copy avoids.
const windowOf = (slot: string | null) => { const w = parseWindow(slot); return w ? `Delivered ${w.from} to ${w.to}` : slot ? `Delivered ${slot}` : "On a delivery run"; };
