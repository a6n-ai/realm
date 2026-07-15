import { Btn, Ph, PageBanner, SectionHead } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";

const TIMELINE: [string, string][] = [
  ["Kolkata", "It starts on the streets of Kolkata — the puchka stall, the spiced water, the one-bite ritual that brings a city together."],
  ["The move", "That flavour travelled to Canada with us. We missed the real thing — so we decided to build it in Scarborough."],
  ["The first fusion", "We asked: what if the puchka met the world? Chicken corn cheese. Schezwan paneer. Toronto's first fusion puchka was born."],
  ["Today", "A neighbourhood spot on Danforth Ave fuelling Scarborough's street-food cravings, watch parties and catering across the GTA."],
];

const VALUES: [string, string, string][] = [
  ["🔥", "Bold by default", "No watered-down flavours. We cook the streets, loud and proud."],
  ["🤝", "Community first", "A local hub for cricket nights, celebrations and late-night cravings."],
  ["🌱", "Fresh, always", "Shells stay crisp, chutneys made in-house, nothing sits around."],
];

export default function AboutPage() {
  return (
    <div>
      <PageBanner
        kicker="Our Story"
        title="From Kolkata Streets To Scarborough"
        sub="We didn't want another Indian restaurant. We wanted the street, the crunch, and the chaos — done right."
        bg="var(--red)"
      />

      {/* intro */}
      <section className="section-pad" style={{ background: "var(--page-bg)", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <div className="hero-grid" style={{ display: "grid", gap: 40, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <Ph label="Founders / kitchen portrait" ratio="4 / 4.2" mod="rotate-l" style={{ boxShadow: "var(--sh-lg)" }} />
              <span className="sticker rotate-r" style={{ bottom: -14, right: -10, background: "var(--ink-bg)", color: "var(--yellow)" }}>
                EST. SCARBOROUGH
              </span>
            </div>
            <div>
              <span className="tape kicker">Why We&apos;re Here</span>
              <h2 className="display" style={{ fontSize: "clamp(2rem,5.5vw,3.4rem)", marginTop: 16 }}>Street Food, Not Restaurant Food</h2>
              <p style={{ fontSize: "1.12rem", fontWeight: 500, marginTop: 16, maxWidth: 500 }}>
                Puchkaman is about the energy of a Kolkata street corner — the puchka-wala packing shells faster than you can eat, the spice
                that hits, the friends gathered around a cart.
              </p>
              <p style={{ fontSize: "1.12rem", fontWeight: 500, marginTop: 14, maxWidth: 500 }}>
                We brought that feeling to Scarborough, then pushed it further with the fusion puchkas nobody else in Toronto was making.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* timeline */}
      <section className="section-pad" style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
        <div className="wrap" style={{ maxWidth: 860 }}>
          <SectionHead kicker="The Journey" title="How We Got Here" align="center" />
          <div style={{ display: "grid", gap: 18 }}>
            {TIMELINE.map(([t, d], i) => (
              <Reveal key={t} delay={i * 60}>
                <div className="card" style={{ display: "flex", gap: 18, padding: 22, alignItems: "flex-start", background: i % 2 ? "var(--cream)" : "var(--white)" }}>
                  <div
                    style={{
                      width: 50,
                      height: 50,
                      flexShrink: 0,
                      borderRadius: "50%",
                      background: "var(--red)",
                      color: "#fff",
                      border: "var(--border)",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 900,
                      fontSize: "1.3rem",
                      boxShadow: "var(--sh-sm)",
                    }}
                  >
                    {i + 1}
                  </div>
                  <div>
                    <h3 style={{ fontSize: "1.4rem", marginBottom: 6 }}>{t}</h3>
                    <p style={{ fontWeight: 500, opacity: 0.85 }}>{d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* values */}
      <section className="section-pad surface-ink" style={{ background: "var(--ink)", color: "var(--cream)", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <SectionHead kicker="What We Stand For" title="The Puchkaman Way" light />
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
            {VALUES.map(([e, t, d], i) => (
              <Reveal key={t} delay={i * 60}>
                <div className="card" style={{ background: "var(--white)", color: "var(--ink)", padding: 26, height: "100%" }}>
                  <div style={{ fontSize: 38, marginBottom: 10 }}>{e}</div>
                  <h3 style={{ fontSize: "1.4rem", marginBottom: 8 }}>{t}</h3>
                  <p style={{ fontWeight: 500, opacity: 0.82 }}>{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-pad" style={{ background: "var(--page-bg)" }}>
        <div className="wrap tac">
          <h2 className="display" style={{ fontSize: "clamp(2rem,6vw,3.6rem)" }}>Come Taste The Story</h2>
          <p style={{ fontSize: "1.12rem", fontWeight: 600, margin: "14px auto 26px", maxWidth: 440 }}>
            Pull up to Danforth Ave or order in — either way, the streets are calling.
          </p>
          <div className="flex wrap-gap" style={{ justifyContent: "center" }}>
            <Btn page="order" variant="red" size="lg">Order Now</Btn>
            <Btn page="contact" variant="ink" size="lg">Find Us</Btn>
          </div>
        </div>
      </section>
    </div>
  );
}
