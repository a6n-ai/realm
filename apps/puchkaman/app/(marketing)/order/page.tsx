import type { Metadata } from "next";
import { PageBanner, Pill } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";
import { OrderPaths } from "@/components/order/order-paths";
import { DOORDASH_URL, UBER_EATS_URL } from "@/lib/links";
import { buildMetadata, breadcrumbJsonLd } from "@/lib/seo";
import { getDeliveryTypes } from "@/lib/delivery/zones.service";

// Reads live delivery-type config (instant discount %, scheduled minimum) so
// the numbers this page advertises can never drift from what checkout
// actually charges. force-dynamic for the same reason as the homepage (see
// its identical comment) — the CI build has no real DB, so a static/ISR page
// here would fail to prerender.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const types = await getDeliveryTypes();
  const instantPct = types.find((t) => t.key === "instant")?.discountPct ?? 0;
  return buildMetadata({
    title: "Order Puchkaman Online — Pickup & Delivery in Scarborough",
    description:
      `Order Puchkaman for pickup in ~15 min, instant delivery within 7km${instantPct > 0 ? ` at ${Math.round(instantPct)}% off` : ""}, or scheduled delivery across the GTA. Also on Uber Eats & DoorDash.`,
    path: "/order",
  });
}

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Order Online", path: "/order" },
]);

function buildWhy(instantPct: number): [string, string][] {
  return [
    [
      "No app fees",
      `Ordering direct is${instantPct > 0 ? ` ${Math.round(instantPct)}% cheaper nearby, and` : ""} every dollar goes to the food.`,
    ],
    ["Freshest crunch", "Puchkas eaten minutes after assembly hit different. Shorter trip, better bite."],
    ["Straight to the kitchen", "Your order lands on the counter POS the moment it's paid — nothing gets relayed."],
  ];
}

// Secondary channel by design: the apps exist for people already in them, and
// for addresses outside our own delivery range. SkipTheDishes is not live.
const APPS = [
  {
    name: "Uber Eats",
    desc: "Delivered by Uber couriers across Scarborough. Same food — their fees and their prices.",
    cta: "Open Uber Eats",
    url: UBER_EATS_URL,
  },
  {
    name: "DoorDash",
    desc: "Live courier tracking through the DoorDash app, wherever they'll take it.",
    cta: "Open DoorDash",
    url: DOORDASH_URL,
  },
];

export default async function OrderPage() {
  const types = await getDeliveryTypes();
  const instantType = types.find((t) => t.key === "instant");
  const scheduledType = types.find((t) => t.key === "scheduled");
  const why = buildWhy(instantType?.discountPct ?? 0);

  return (
    <div>
      {/* breadcrumb is static, developer-authored JSON-LD (see breadcrumbJsonLd
          in lib/seo.ts) — no user input reaches this JSON.stringify. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <PageBanner
        kicker="Order Online"
        title="Get Your Puchka Fix"
        sub="Pick it up in about 15 minutes, or let us deliver it — same menu, same secure checkout, no app in the middle."
        bg="var(--page-bg)"
        color="var(--ink)"
        surface="surface-yellow"
        crumb="Order Online"
      />

      <section className="section-pad" style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
        <div className="wrap" style={{ maxWidth: 1040 }}>
          <Reveal>
            <OrderPaths
              instantDiscountPct={instantType?.discountPct ?? 0}
              scheduledMinSubtotal={scheduledType?.minSubtotal ?? 0}
            />
          </Reveal>

          <div className="card card--cream order-why">
            <h2 className="display" style={{ fontSize: "1.6rem", marginBottom: 18 }}>
              Why Order Direct?
            </h2>
            <div className="grid order-why__grid">
              {why.map(([title, body]) => (
                <div key={title}>
                  <h3 style={{ fontSize: "1.08rem", marginBottom: 6 }}>{title}</h3>
                  <p style={{ fontWeight: 500, opacity: 0.82, fontSize: "0.92rem", textWrap: "pretty" }}>
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <h2 className="display order-apps__head">Already On An App?</h2>
          <p className="order-apps__sub">
            We&apos;re on both — worth it if you&apos;re outside our delivery range, though ordering
            direct above is cheaper.
          </p>
          <div className="order-apps">
            {APPS.map((app, i) => (
              <Reveal key={app.name} delay={i * 60}>
                <a
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card card--lift order-app"
                >
                  <Pill>Third-party</Pill>
                  <h3 className="order-app__name">{app.name}</h3>
                  <p className="order-app__desc">{app.desc}</p>
                  <span className="btn btn--ink btn--block">{app.cta} ↗</span>
                </a>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
