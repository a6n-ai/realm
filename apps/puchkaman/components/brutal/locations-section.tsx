"use client";

import { SectionHead } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";
import { StaticMap } from "@foundry/design-system";
import { LOCATIONS } from "@/lib/links";

/** Homepage "find us" section — one card per LOCATIONS entry, each with its
 *  own zoomed-in map (unlike /contact's single-pin map, these two storefronts
 *  are on opposite coasts, so a shared fitBounds view would zoom out to all of
 *  Canada and show nothing useful). */
export function LocationsSection() {
  return (
    <section className="section-pad" style={{ background: "var(--page-bg)", borderBottom: "var(--border)" }}>
      <div className="wrap">
        <SectionHead
          kicker="Find Us"
          title="Street Food Café – Puchkaman, Coast to Coast"
          sub="Two storefronts, one obsession with fresh puchkas — Scarborough, Ontario and Delta, British Columbia."
        />
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          {LOCATIONS.map((loc, i) => (
            <Reveal key={loc.city} delay={i * 80}>
              <div className="card" style={{ overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
                <StaticMap center={{ lat: loc.lat, lng: loc.lng }} markers={[{ lat: loc.lat, lng: loc.lng, color: "#111", title: loc.fullAddress }]} zoom={14} heightPx={220} />
                <div style={{ padding: 22, background: "var(--white)", flex: 1, display: "flex", flexDirection: "column" }}>
                  <h3 className="display" style={{ fontSize: "1.4rem", marginBottom: 6 }}>
                    📍 {loc.city}, {loc.province}
                  </h3>
                  <p style={{ fontWeight: 600, fontSize: "1rem", opacity: 0.85, marginBottom: 18 }}>
                    {loc.addressLines[0]}
                    <br />
                    {loc.addressLines[1]}
                  </p>
                  <a
                    href={loc.directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--ink btn--block"
                    style={{ marginTop: "auto" }}
                  >
                    🧭 Get Directions ↗
                  </a>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
