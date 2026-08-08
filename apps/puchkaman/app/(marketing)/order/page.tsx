import type { Metadata } from "next";
import { Btn, PageBanner, Pill } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";
import { OrderDirectCta } from "@/components/order/order-direct-cta";
import { OrderPickupCta } from "@/components/order/order-pickup-cta";
import { DOORDASH_URL, UBER_EATS_URL } from "@/lib/links";
import { buildMetadata, breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Order Puchkaman Online — Pickup & Delivery in Scarborough",
  description:
    "Order Puchkaman for pickup in ~15 min, instant delivery within 7km at 15% off, or scheduled delivery across the GTA. Also on Uber Eats & DoorDash.",
  path: "/order",
});

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Order Online", path: "/order" },
]);

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <PageBanner
        kicker="Order Online"
        title="Get Your Puchka Fix"
        sub="Pickup, instant delivery within 7km, or scheduled delivery beyond that — all with secure online checkout."
        bg="var(--page-bg)"
        color="var(--ink)"
        surface="surface-yellow"
        crumb="Order Online"
      />

      <section className="section-pad" style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
        <div className="wrap" style={{ maxWidth: 960 }}>
          <Reveal>
            <OrderPickupCta />
          </Reveal>

          <h2 className="display" style={{ fontSize: "1.6rem", margin: "36px 0 4px" }}>
            Instant Delivery
          </h2>
          <p style={{ fontWeight: 500, opacity: 0.75, marginBottom: 18, fontSize: "0.92rem" }}>
            Within 7km of the store — pick your channel.
          </p>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}
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

            <Reveal delay={CHANNELS.length * 60}>
              <div className="card card--green surface-green" style={{ color: "#fff", padding: 26, height: "100%" }}>
                <div className="flex center between" style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 34 }} aria-hidden="true">
                    🛵
                  </div>
                  <Pill variant="yellow">15% off</Pill>
                </div>
                <h3 style={{ fontSize: "1.5rem", marginBottom: 8 }}>From Us</h3>
                <p style={{ fontWeight: 500, opacity: 0.92, marginBottom: 20 }}>
                  Skip the app fees — order direct and we deliver it ourselves, 15% cheaper.
                </p>
                <OrderDirectCta />
              </div>
            </Reveal>
          </div>

          <h2 className="display" style={{ fontSize: "1.6rem", margin: "36px 0 4px" }}>
            Scheduled Delivery
          </h2>
          <p style={{ fontWeight: 500, opacity: 0.75, marginBottom: 18, fontSize: "0.92rem" }}>
            Beyond 7km — direct from us only, by appointment.
          </p>
          <div className="card" style={{ padding: 26, background: "var(--white)" }}>
            <div className="flex center between wrap-gap" style={{ marginBottom: 12, gap: 10 }}>
              <div style={{ fontSize: 34 }} aria-hidden="true">
                📅
              </div>
              <Pill variant="ink">$35 minimum</Pill>
            </div>
            <h3 style={{ fontSize: "1.5rem", marginBottom: 8 }}>Book a Delivery Time</h3>
            <p style={{ fontWeight: 500, opacity: 0.82, marginBottom: 20, maxWidth: 560 }}>
              Outside our instant-delivery zone? Order ahead and pick a time — same real checkout,
              you&apos;ll just choose a slot instead of ~15 min pickup.
            </p>
            <Btn href="/checkout?fulfillment=delivery" variant="ink" block>
              Schedule Delivery →
            </Btn>
          </div>

          <div className="card card--cream" style={{ padding: "clamp(22px,3vw,32px)", marginTop: 28 }}>
            <h3 className="display" style={{ fontSize: "1.5rem", marginBottom: 18 }}>
              Why Order Direct?
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
