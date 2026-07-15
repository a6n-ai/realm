import { Btn, PageBanner, Pill } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";

type Channel = { name: string; tag: string; desc: string; cta: string; bg: string; color: string; big?: boolean; soon?: boolean; emoji: string };

const CHANNELS: Channel[] = [
  { name: "Pickup Order", tag: "No fees · Best value", desc: "Order direct & skip the delivery app fees. Ready in ~15 min at 3315 Danforth Ave.", cta: "Order Pickup", bg: "var(--red)", color: "#fff", big: true, emoji: "🛍️" },
  { name: "Uber Eats", tag: "Delivery", desc: "Get Puchkaman delivered hot to your door across Scarborough.", cta: "Open Uber Eats", bg: "var(--white)", color: "var(--ink)", emoji: "🛵" },
  { name: "DoorDash", tag: "Delivery", desc: "Fast delivery with live tracking through DoorDash.", cta: "Open DoorDash", bg: "var(--white)", color: "var(--ink)", emoji: "🚗" },
  { name: "SkipTheDishes", tag: "Coming soon", desc: "Skip delivery is launching shortly — check back soon.", cta: "Coming Soon", bg: "var(--cream)", color: "var(--ink)", soon: true, emoji: "⏳" },
];

const WHY: [string, string, string][] = [
  ["💸", "No delivery fees", "Every dollar goes to your food, not the app."],
  ["⚡", "Freshest crunch", "Puchkas eaten minutes after assembly hit different."],
  ["⏱️", "~15 min ready", "Order ahead, walk in, walk out."],
];

export default function OrderPage() {
  return (
    <div>
      <PageBanner
        kicker="Order Online"
        title="Get Your Puchka Fix"
        sub="Pickup is the move — it's faster, fresher, and skips the delivery fees. Delivery's here too."
        bg="var(--page-bg)"
        color="var(--ink)"
        surface="surface-yellow"
      />

      <section className="section-pad" style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
        <div className="wrap" style={{ maxWidth: 920 }}>
          {/* pickup hero */}
          <Reveal>
            <div className="card card--red surface-red" style={{ color: "#fff", padding: "clamp(26px,4vw,42px)", marginBottom: 24, position: "relative", overflow: "hidden" }}>
              <span className="sticker rotate-r" style={{ top: 16, right: 16, background: "var(--yellow)", color: "var(--ink-deep)" }}>💸 ZERO FEES</span>
              <div style={{ fontSize: 44, marginBottom: 8 }}>🛍️</div>
              <h2 className="display" style={{ fontSize: "clamp(2rem,5.5vw,3.2rem)" }}>Order Pickup</h2>
              <p style={{ fontWeight: 500, fontSize: "1.1rem", margin: "12px 0 22px", maxWidth: 480 }}>
                Order direct and skip every delivery app fee. Freshest puchkas, ready in about 15 minutes at our Danforth Ave kitchen.
              </p>
              <div className="flex wrap-gap">
                <Btn variant="ink" size="lg">Start Pickup Order →</Btn>
                <Btn page="contact" variant="yellow" size="lg">📞 Call To Order</Btn>
              </div>
            </div>
          </Reveal>

          {/* delivery channels */}
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
            {CHANNELS.slice(1).map((c, i) => (
              <Reveal key={c.name} delay={i * 60}>
                <div className="card" style={{ background: c.bg, color: c.color, padding: 26, height: "100%", opacity: c.soon ? 0.9 : 1 }}>
                  <div className="flex center between" style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 34 }}>{c.emoji}</div>
                    <Pill variant={c.soon ? "ink" : "red"}>{c.tag}</Pill>
                  </div>
                  <h3 style={{ fontSize: "1.5rem", marginBottom: 8 }}>{c.name}</h3>
                  <p style={{ fontWeight: 500, opacity: 0.82, marginBottom: 20 }}>{c.desc}</p>
                  {c.soon ? (
                    <span className="btn btn--block" style={{ background: "var(--cream)", opacity: 0.6, cursor: "not-allowed", boxShadow: "none" }}>{c.cta}</span>
                  ) : (
                    <span className="btn btn--ink btn--block">{c.cta} ↗</span>
                  )}
                </div>
              </Reveal>
            ))}
          </div>

          {/* why pickup */}
          <div className="card card--cream" style={{ padding: "clamp(22px,3vw,32px)", marginTop: 28 }}>
            <h3 className="display" style={{ fontSize: "1.5rem", marginBottom: 18 }}>Why Order Pickup?</h3>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 18 }}>
              {WHY.map(([e, t, d]) => (
                <div key={t}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>{e}</div>
                  <h4 style={{ fontSize: "1.05rem", marginBottom: 4 }}>{t}</h4>
                  <p style={{ fontWeight: 500, opacity: 0.8, fontSize: "0.9rem" }}>{d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
