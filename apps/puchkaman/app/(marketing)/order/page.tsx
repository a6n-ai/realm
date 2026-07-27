import { Btn, PageBanner, Pill } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";
import { OrderPickupCta } from "@/components/order/order-pickup-cta";
import { DOORDASH_URL, UBER_EATS_URL } from "@/lib/links";

type Channel = {
  name: string;
  tag: string;
  desc: string;
  cta: string;
  bg: string;
  color: string;
  soon?: boolean;
  emoji: string;
  url?: string;
};

const CHANNELS: Channel[] = [
  {
    name: "Uber Eats",
    tag: "Delivery",
    desc: "Get Puchkaman delivered hot to your door across Scarborough.",
    cta: "Open Uber Eats",
    bg: "var(--white)",
    color: "var(--ink)",
    emoji: "🛵",
    url: UBER_EATS_URL,
  },
  {
    name: "DoorDash",
    tag: "Delivery",
    desc: "Fast delivery with live tracking through DoorDash.",
    cta: "Open DoorDash",
    bg: "var(--white)",
    color: "var(--ink)",
    emoji: "🚗",
    url: DOORDASH_URL,
  },
  {
    name: "SkipTheDishes",
    tag: "Coming soon",
    desc: "Skip delivery is launching shortly — check back soon.",
    cta: "Coming Soon",
    bg: "var(--cream)",
    color: "var(--ink)",
    soon: true,
    emoji: "⏳",
  },
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
        sub="Build a pickup cart from the menu, pay on-site, we fire it to the POS. Delivery apps still here too."
        bg="var(--page-bg)"
        color="var(--ink)"
        surface="surface-yellow"
      />

      <section className="section-pad" style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
        <div className="wrap" style={{ maxWidth: 960 }}>
          <Reveal>
            <OrderPickupCta />
          </Reveal>

          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", marginTop: 28 }}
          >
            {CHANNELS.map((c, i) => (
              <Reveal key={c.name} delay={i * 60}>
                <div
                  className="card"
                  style={{
                    background: c.bg,
                    color: c.color,
                    padding: 26,
                    height: "100%",
                    opacity: c.soon ? 0.9 : 1,
                  }}
                >
                  <div className="flex center between" style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 34 }} aria-hidden="true">
                      {c.emoji}
                    </div>
                    <Pill variant={c.soon ? "ink" : "green"}>{c.tag}</Pill>
                  </div>
                  <h3 style={{ fontSize: "1.5rem", marginBottom: 8 }}>{c.name}</h3>
                  <p style={{ fontWeight: 500, opacity: 0.82, marginBottom: 20 }}>{c.desc}</p>
                  {c.soon ? (
                    <span
                      className="btn btn--block"
                      style={{
                        background: "var(--cream)",
                        opacity: 0.6,
                        cursor: "not-allowed",
                        boxShadow: "none",
                      }}
                    >
                      {c.cta}
                    </span>
                  ) : c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn--ink btn--block"
                    >
                      {c.cta} ↗
                    </a>
                  ) : (
                    <Btn variant="ink" block>
                      {c.cta}
                    </Btn>
                  )}
                </div>
              </Reveal>
            ))}
          </div>

          <div className="card card--cream" style={{ padding: "clamp(22px,3vw,32px)", marginTop: 28 }}>
            <h3 className="display" style={{ fontSize: "1.5rem", marginBottom: 18 }}>
              Why Order Pickup?
            </h3>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 18 }}>
              {WHY.map(([e, t, d]) => (
                <div key={t}>
                  <div style={{ fontSize: 28, marginBottom: 6 }} aria-hidden="true">
                    {e}
                  </div>
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
