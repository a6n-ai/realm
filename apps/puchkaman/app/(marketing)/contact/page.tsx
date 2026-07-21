"use client";

import { useState } from "react";
import { Btn, PageBanner } from "@/components/brutal/shared";
import { ADDRESS, MAP_DIRECTIONS_URL, MAP_EMBED_URL } from "@/lib/links";

const HOURS: [string, string][] = [
  ["Monday", "Closed"],
  ["Tue – Thu", "12:00pm – 10:00pm"],
  ["Fri – Sat", "12:00pm – 11:30pm"],
  ["Sunday", "12:00pm – 10:00pm"],
];

export default function ContactPage() {
  const [copied, setCopied] = useState("");
  const copy = (label: string, text: string) => {
    if (navigator.clipboard) navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1600);
  };

  return (
    <div>
      <PageBanner
        kicker="Find Us"
        title="Come Say Hi"
        sub="We're on Danforth Ave in Scarborough. Pull up, call ahead, or slide into our DMs."
        bg="var(--ink)"
        color="var(--cream)"
      />

      <section className="section-pad" style={{ background: "var(--page-bg)", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <div className="contact-grid" style={{ display: "grid", gap: 24 }}>
            {/* info column */}
            <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
              <div className="card" style={{ background: "var(--white)", padding: 24 }}>
                <h3 className="display" style={{ fontSize: "1.4rem", marginBottom: 14 }}>📍 Location</h3>
                <p style={{ fontWeight: 600, fontSize: "1.05rem" }}>
                  3315 Danforth Ave
                  <br />
                  Scarborough, ON
                </p>
                <button onClick={() => copy("addr", "3315 Danforth Ave, Scarborough, ON")} className="btn btn--sm" style={{ marginTop: 14 }}>
                  {copied === "addr" ? "✓ Copied!" : "📋 Copy Address"}
                </button>
              </div>

              <div className="card" style={{ background: "var(--white)", padding: 24 }}>
                <h3 className="display" style={{ fontSize: "1.4rem", marginBottom: 14 }}>📞 Contact</h3>
                <div style={{ display: "grid", gap: 10 }}>
                  <button
                    onClick={() => copy("phone", "4160000000")}
                    className="flex center between"
                    style={{ background: "var(--cream)", border: "var(--border)", borderRadius: 10, padding: "12px 14px", fontWeight: 700 }}
                  >
                    <span>📱 (416) 000-0000</span>
                    <span className="mono" style={{ fontSize: "0.7rem" }}>{copied === "phone" ? "✓ COPIED" : "TAP TO COPY"}</span>
                  </button>
                  <a
                    href="#"
                    className="flex center between"
                    style={{ background: "#25D366", color: "#fff", border: "var(--border)", borderRadius: 10, padding: "12px 14px", fontWeight: 700 }}
                  >
                    <span>💬 WhatsApp Us</span>
                    <span style={{ opacity: 0.8 }}>↗</span>
                  </a>
                  <a
                    href="#"
                    className="flex center between"
                    style={{ background: "var(--ink)", color: "var(--yellow)", border: "var(--border)", borderRadius: 10, padding: "12px 14px", fontWeight: 700 }}
                  >
                    <span>📸 @puchkaman</span>
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
                <iframe
                  title={`Puchkaman location — ${ADDRESS}`}
                  src={MAP_EMBED_URL}
                  style={{ display: "block", width: "100%", aspectRatio: "4 / 3.4", minHeight: 300, border: "none" }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
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
                <Btn page="catering" variant="red" size="lg" block>Request a Catering Quote →</Btn>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
