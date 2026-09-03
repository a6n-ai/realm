"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, PageBanner } from "@/components/brutal/shared";
import { StaticMap } from "@foundry/design-system";
import { ADDRESS, LOCATIONS, MAP_DIRECTIONS_URL, PHONE_DISPLAY, PHONE_TEL } from "@/lib/links";
import { DEFAULT_STORE_LAT, DEFAULT_STORE_LNG } from "@/lib/delivery/distance";
import { INSTAGRAM_URL } from "@/lib/seo";

// Only Scarborough (the operating location) has known phone/hours — Delta
// gets its own, lighter card below rather than a fabricated symmetric one.
const DELTA = LOCATIONS.find((l) => l.city === "Delta")!;

const HOURS: [string, string][] = [
  ["Sun – Thu", "3:00pm – 2:00am"],
  ["Fri – Sat", "3:00pm – 3:00am"],
];

export function ContactView({ activeCity }: { activeCity: string | null }) {
  // Only Scarborough's card has phone/hours; Delta stays the lighter
  // address-only card either way. Delta as the active franchise just swaps
  // which one renders first, so the visitor's own location leads.
  const deltaFirst = activeCity === "Delta";
  const [copied, setCopied] = useState("");
  // One timer, cleared on each copy: without it a second copy inherited the
  // first one's clock and the "Copied" label vanished a moment after the tap.
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = (label: string, text: string) => {
    // Only claim success if the write actually succeeded — an insecure context
    // or a denied permission used to still say "Copied".
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(label);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(""), 1600);
      })
      .catch(() => setCopied(""));
  };

  return (
    <div>
      <PageBanner
        kicker="Find Us"
        title="Come Say Hi"
        sub={
          deltaFirst
            ? "We're in Delta, BC (Metro Vancouver), and on Danforth Ave in Scarborough too. Pull up, call ahead, or slide into our DMs."
            : "We're on Danforth Ave in Scarborough, and now in Delta, BC (Metro Vancouver) too. Pull up, call ahead, or slide into our DMs."
        }
        bg="var(--ink)"
        color="var(--cream)"
        crumb="Contact"
      />

      {(() => {
        const scarboroughSection = (
      <section className="section-pad" style={{ background: "var(--page-bg)", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <div className="contact-grid" style={{ display: "grid", gap: 24 }}>
            {/* info column */}
            <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
              <div className="card" style={{ background: "var(--white)", padding: 24 }}>
                <h3 className="display" style={{ fontSize: "1.4rem", marginBottom: 14 }}>📍 Scarborough, ON</h3>
                <p style={{ fontWeight: 600, fontSize: "1.05rem" }}>
                  3315 Danforth Ave
                  <br />
                  Scarborough, ON
                </p>
                <button type="button" onClick={() => copy("addr", "3315 Danforth Ave, Scarborough, ON")} className="btn btn--sm" style={{ marginTop: 14 }}>
                  <span className="label-swap" key={copied === "addr" ? "copied" : "idle"}>
                    {copied === "addr" ? "✓ Copied!" : "📋 Copy Address"}
                  </span>
                </button>
              </div>

              <div className="card" style={{ background: "var(--white)", padding: 24 }}>
                <h3 className="display" style={{ fontSize: "1.4rem", marginBottom: 14 }}>📞 Contact</h3>
                <div style={{ display: "grid", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => copy("phone", PHONE_TEL)}
                    className="flex center between contact-row"
                    style={{ background: "var(--cream)", border: "var(--border)", borderRadius: 10, padding: "12px 14px", fontWeight: 700, flexWrap: "wrap", gap: 6 }}
                  >
                    <span>📱 {PHONE_DISPLAY}</span>
                    <span className="mono label-swap" key={copied === "phone" ? "copied" : "idle"} style={{ fontSize: "0.7rem" }}>
                      {copied === "phone" ? "✓ COPIED" : "TAP TO COPY"}
                    </span>
                  </button>
                  <a
                    href={`https://wa.me/${PHONE_TEL.replace("+", "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex center between contact-row"
                    style={{ background: "#25D366", color: "#fff", border: "var(--border)", borderRadius: 10, padding: "12px 14px", fontWeight: 700 }}
                  >
                    <span>💬 WhatsApp Us</span>
                    <span style={{ opacity: 0.8 }}>↗</span>
                  </a>
                  <a
                    href={INSTAGRAM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex center between contact-row"
                    style={{ background: "var(--ink)", color: "var(--yellow)", border: "var(--border)", borderRadius: 10, padding: "12px 14px", fontWeight: 700 }}
                  >
                    <span>📸 @puchkamancanada</span>
                    <span style={{ opacity: 0.8 }}>↗</span>
                  </a>
                </div>
              </div>

              <div className="card" style={{ background: "var(--white)", padding: 24 }}>
                <h3 className="display" style={{ fontSize: "1.4rem", marginBottom: 14 }}>🕑 Hours</h3>
                <div style={{ display: "grid", gap: 8 }}>
                  {HOURS.map(([d, h]) => (
                    <div
                      key={d}
                      className="flex center between"
                      style={{ borderBottom: "2px dotted rgba(22,20,13,.2)", paddingBottom: 7, fontWeight: 600 }}
                    >
                      <span>{d}</span>
                      <span style={{ color: h === "Closed" ? "var(--red)" : "inherit", fontFamily: "var(--mono)", fontSize: "0.86rem" }}>{h}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* map + catering cta */}
            <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
              <div className="card" style={{ overflow: "hidden", padding: 0 }}>
                <StaticMap
                  center={{ lat: DEFAULT_STORE_LAT, lng: DEFAULT_STORE_LNG }}
                  markers={[{ lat: DEFAULT_STORE_LAT, lng: DEFAULT_STORE_LNG, color: "#111", title: ADDRESS }]}
                  zoom={14}
                  heightPx={320}
                />
                <div style={{ padding: 16, borderTop: "var(--border)", background: "var(--white)" }}>
                  <a href={MAP_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer" className="btn btn--ink btn--block">🧭 Get Directions ↗</a>
                </div>
              </div>

              <div className="card card--ink surface-ink" style={{ color: "var(--cream)", padding: 26 }}>
                <h3 className="display" style={{ fontSize: "1.5rem", color: "var(--yellow)", marginBottom: 8 }}>Planning Something Big?</h3>
                <p style={{ fontWeight: 500, opacity: 0.88, marginBottom: 18 }}>
                  Live puchka & chaat catering across the GTA — birthdays, offices, weddings & watch parties.
                </p>
                <Btn page="catering" variant="green" size="lg" block>Request a Catering Quote →</Btn>
              </div>
            </div>
          </div>
        </div>
      </section>
        );

        // Lighter card than Scarborough's above since only the address is
        // confirmed yet (no published phone/hours for Delta).
        const deltaSection = (
      <section className="section-pad" style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <h2 className="display" style={{ fontSize: "1.7rem", marginBottom: 20 }}>
            {deltaFirst ? "Delta, BC (Metro Vancouver)" : "Also in Delta, BC (Metro Vancouver)"}
          </h2>
          <div className="contact-grid" style={{ display: "grid", gap: 24 }}>
            <div className="card" style={{ background: "var(--white)", padding: 24, alignSelf: "start" }}>
              <h3 className="display" style={{ fontSize: "1.4rem", marginBottom: 14 }}>📍 Delta, BC (Metro Vancouver)</h3>
              <p style={{ fontWeight: 600, fontSize: "1.05rem" }}>
                {DELTA.addressLines[0]}
                <br />
                {DELTA.addressLines[1]}
              </p>
              <button onClick={() => copy("delta-addr", DELTA.fullAddress)} className="btn btn--sm" style={{ marginTop: 14 }}>
                {copied === "delta-addr" ? "✓ Copied!" : "📋 Copy Address"}
              </button>
            </div>
            <div className="card" style={{ overflow: "hidden", padding: 0 }}>
              <StaticMap
                center={{ lat: DELTA.lat, lng: DELTA.lng }}
                markers={[{ lat: DELTA.lat, lng: DELTA.lng, color: "#111", title: DELTA.fullAddress }]}
                zoom={14}
                heightPx={260}
              />
              <div style={{ padding: 16, borderTop: "var(--border)", background: "var(--white)" }}>
                <a href={DELTA.directionsUrl} target="_blank" rel="noopener noreferrer" className="btn btn--ink btn--block">🧭 Get Directions ↗</a>
              </div>
            </div>
          </div>
        </div>
      </section>
        );

        return deltaFirst ? (
          <>
            {deltaSection}
            {scarboroughSection}
          </>
        ) : (
          <>
            {scarboroughSection}
            {deltaSection}
          </>
        );
      })()}
    </div>
  );
}
