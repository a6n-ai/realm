"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BuildTiffinLink } from "@/components/landing/build-tiffin-link";
import { StaticMap } from "./static-map";
import { checkDelivery, type DeliveryCheck as Result } from "@/lib/landing/check-delivery";
import { trackMeta } from "@foundry/meta-pixel/client";

type Point = { lat: number; lng: number };
type Area = { name: string; slotWindow: string | null; point: Point | null };
type Ring = { name: string; radiusKm: number };

const GTA: Point = { lat: 43.7, lng: -79.42 };
// A code further than this from the GTA gets no pin: the map stays on our areas.
const NEAR_KM = 120;

const km = (a: Point, b: Point) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

export function DeliveryCheck({ origin, rings, areas }: { origin: Point | null; rings: Ring[]; areas: Area[] }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const placed = areas.filter((a): a is Area & { point: Point } => a.point != null);
  // The checked code gets a pin when it is near; a far code leaves the map on our areas.
  const near = result && "point" in result && result.point && km(result.point, origin ?? GTA) <= NEAR_KM ? result.point : null;
  const pin = near ? { ...near, served: result?.status === "served" } : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const eventId = crypto.randomUUID();
      const r = await checkDelivery(value, { eventId, eventSourceUrl: window.location.href });
      setResult(r);
      setFocus(r.status === "served" ? (r.zone?.name ?? null) : null);
      if (r.status === "served" || r.status === "not_served") {
        trackMeta("FindLocation", {}, eventId);
      }
    });
  };

  const showArea = (a: Area) => setFocus(a.name);

  const verdict =
    result?.status === "invalid" ? { tone: "info", title: "That is not a full postal code.", body: "Use all six characters, like M5V 2T6." }
    : result?.status === "busy" ? { tone: "info", title: "One moment.", body: "Too many checks in a minute. Try again shortly." }
    : result?.status === "served" ? { tone: "yes", title: `Yes, we deliver to ${result.postalCode}.`, body: `${result.zone?.name ?? "Your area"}${result.zone?.slotWindow ? `, delivered ${result.zone.slotWindow}` : ""}.` }
    : result?.status === "not_served" ? { tone: "no", title: `Not yet at ${result.postalCode}.`, body: "We are adding areas across the GTA. Tell us where you are and we will write when we reach you." }
    : null;

  return (
    <div className="tg-card tg-deliver">
      <StaticMap origin={origin} rings={rings} places={placed} focus={focus} pin={pin} />
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
              {verdict.tone === "yes" ? <BuildTiffinLink className="tg-link tg-link--tap">Build my tiffin</BuildTiffinLink> : null}
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
