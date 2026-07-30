import type { Metadata } from "next";
import Image from "next/image";
import type { FileDetail } from "@realm/storage/model";
import { Btn, Ph, PageBanner, Pill, SectionHead } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";
import { ProductImage } from "@/components/products/product-image";
import { productsService } from "@/lib/services/products.service";
import { TAG_STYLE } from "@/lib/menu-categories";
import { buildMetadata, breadcrumbJsonLd } from "@/lib/seo";

// Tried ISR (`revalidate = 60`) for a caching win, but the CI Docker build has
// no real DB at build time and Next tries to prerender ISR/static pages during
// `next build`, which crashed the build. Reverted to force-dynamic until the
// build pipeline has a real build-time Postgres.
export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Fusion Puchkas Toronto — Chicken Corn Cheese, Schezwan Paneer | Puchkaman",
  description:
    "Toronto's first fusion puchka spot. Crispy puchka shells stuffed with chicken corn cheese, schezwan paneer, momo filling & more — made fresh in Scarborough.",
  path: "/fusion",
});

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Fusion Puchkas", path: "/fusion" },
]);

// `key` is a stable React key — product *names* aren't unique (the catalog
// genuinely has multiple distinct products sharing a display name), so
// keying by name collides. publicId for real products, a static string for
// the hardcoded fallback (already unique there).
type FusionCard = { key: string; name: string; desc: string; price: string; badge: string; badgeViral: boolean; image: FileDetail | null };

const FUSION_ITEMS: [string, string, string, string][] = [
  ["Chicken Corn Cheese Puchka", "Creamy corn, melty cheese, juicy chicken. The one that went viral.", "$10", "🔥 Most Viral"],
  ["Firangi Chicken Puchka", "Western herbs & smoky chicken meet the classic shell.", "$10", "★ Best Seller"],
  ["Paneer Schezwan Puchka", "Indo-Chinese schezwan heat with soft paneer.", "$9", "Spicy"],
  ["Spicy Chicken Blast Puchka", "Built for heat-seekers. Proceed with water nearby.", "$10", "🌶️🌶️🌶️"],
  ["Veg Mo-Puchka", "Momo filling tucked into a crispy puchka.", "$9", "New"],
  ["Paneer Mo-Puchka", "Paneer momo meets puchka in one bite.", "$9", "New"],
];

const STEPS: [string, string][] = [
  ["Pick your shell", "Grab a crispy puchka — we keep them fresh and shatter-crisp."],
  ["Load the filling", "Each fusion comes pre-stuffed with its signature global flavour."],
  ["Add the sauce", "Drizzle the matching sauce — schezwan, cheese, or tangy water."],
  ["One bite, no pause", "Whole thing, all at once. No nibbling. That's the rule."],
];

export default async function FusionPage() {
  // Real fusion-category products with photos; fall back to the static copy when
  // the menu has none (fresh DB).
  const fusionProducts = (await productsService.listActive()).filter((p) => p.category === "fusion");
  const fusionCards: FusionCard[] = fusionProducts.length
    ? fusionProducts.map((p) => {
        const tag = (p.tags ?? []).find((t) => TAG_STYLE[t]);
        return {
          key: p.publicId,
          name: p.name,
          desc: p.description ?? "",
          price: `$${Number(p.price).toFixed(0)}`,
          badge: tag ? TAG_STYLE[tag].label : "",
          badgeViral: tag === "viral",
          image: (p.image as FileDetail | null) ?? null,
        };
      })
    : FUSION_ITEMS.map(([name, desc, price, badge]) => ({ key: name, name, desc, price, badge, badgeViral: badge.includes("Viral"), image: null }));
  const videoUrl = (fusionProducts.find((p) => p.image)?.image as FileDetail | null)?.url ?? null;

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <PageBanner
        kicker="The Hero Product"
        title="Fusion Puchkas, Explained"
        sub="Crispy puchka shells, stuffed with bold global flavours. If you've never had one — start here."
        bg="var(--green)"
        crumb="Fusion Puchkas"
      />

      {/* What is it */}
      <section className="section-pad" style={{ background: "var(--page-bg)", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <div className="hero-grid" style={{ display: "grid", gap: 40, alignItems: "center" }}>
            <div>
              <span className="tape kicker">Puchka 101</span>
              <h2 className="display" style={{ fontSize: "clamp(2rem,5.5vw,3.4rem)", marginTop: 16 }}>What Is a Fusion Puchka?</h2>
              <p style={{ fontSize: "1.12rem", fontWeight: 500, marginTop: 16, maxWidth: 500 }}>
                A puchka (aka pani puri / golgappa / gupchup) is a hollow, crispy shell you fill and eat in one bite. We took that
                100-year-old Kolkata street snack and stuffed it with flavours from around the world.
              </p>
              <p style={{ fontSize: "1.12rem", fontWeight: 500, marginTop: 14, maxWidth: 500 }}>
                Think chicken corn cheese, schezwan paneer, or a momo packed inside the shell. Same crunch — totally new hit.
              </p>
              <div className="flex wrap-gap" style={{ marginTop: 24 }}>
                <Pill variant="green">100% Made Fresh</Pill>
                <Pill variant="ink">Veg & Non-Veg</Pill>
                <Pill>One-Bite Rule</Pill>
              </div>
            </div>
            <div style={{ position: "relative" }}>
              {videoUrl ? (
                <div className="rotate-r" style={{ position: "relative", width: "100%", aspectRatio: "4 / 4.2", border: "var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh-lg)", overflow: "hidden" }}>
                  <Image
                    src={videoUrl}
                    alt="Fusion puchka"
                    fill
                    sizes="(min-width: 880px) 45vw, 90vw"
                    priority
                    style={{ objectFit: "cover" }}
                  />
                </div>
              ) : (
                <Ph label="VIDEO — fusion puchka being assembled" ratio="4 / 4.2" mod="rotate-r" style={{ boxShadow: "var(--sh-lg)" }} />
              )}
              <span className="sticker rotate-l" style={{ top: -14, left: -12, background: "var(--ink-bg)", color: "var(--yellow)" }}>
                ▶ WATCH THE REEL
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* How to eat */}
      <section className="section-pad" style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <SectionHead kicker="The Method" title="How To Eat One" align="center" sub="Four steps. Don't overthink it — the crunch waits for no one." />
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
            {STEPS.map(([t, d], i) => (
              <Reveal key={t} delay={i * 70}>
                <div className="card" style={{ padding: 24, height: "100%", background: i % 2 ? "var(--cream)" : "var(--white)" }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: "50%",
                      background: "var(--green)",
                      color: "#fff",
                      border: "var(--border)",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 900,
                      fontSize: "1.5rem",
                      boxShadow: "var(--sh-sm)",
                      marginBottom: 16,
                    }}
                  >
                    {i + 1}
                  </div>
                  <h3 style={{ fontSize: "1.3rem", marginBottom: 8 }}>{t}</h3>
                  <p style={{ fontWeight: 500, opacity: 0.82 }}>{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Best to try */}
      <section className="section-pad surface-ink" style={{ background: "var(--ink)", color: "var(--cream)", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <SectionHead kicker="Start Here" title="Best Fusion Puchkas To Try" light sub="New to fusion? These are the crowd-tested winners." />
          <div className="grid fusion-menu-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {fusionCards.map((c, i) => (
              <Reveal key={c.key} delay={i * 50}>
                <div className="card card--lift" style={{ background: "var(--white)", color: "var(--ink)", overflow: "hidden", height: "100%" }}>
                  <div style={{ position: "relative" }}>
                    <ProductImage image={c.image} name={c.name} />
                    {c.badge && (
                      <span
                        className="sticker rotate-l"
                        style={{
                          top: 10,
                          left: 10,
                          fontSize: "0.7rem",
                          background: c.badgeViral ? "var(--green)" : "var(--yellow)",
                          color: c.badgeViral ? "#fff" : "var(--ink-deep)",
                        }}
                      >
                        {c.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ padding: 18 }}>
                    <div className="flex center between">
                      <h3 style={{ fontSize: "1.2rem", maxWidth: "75%" }}>{c.name}</h3>
                      <span className="display" style={{ fontSize: "1.2rem", color: "var(--green)" }}>{c.price}</span>
                    </div>
                    <p style={{ fontWeight: 500, opacity: 0.82, marginTop: 8, fontSize: "0.92rem" }}>{c.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-pad" style={{ background: "var(--page-bg)" }}>
        <div className="wrap tac">
          <h2 className="display" style={{ fontSize: "clamp(2.2rem,6vw,4rem)" }}>Try Fusion Puchkas Today</h2>
          <p style={{ fontSize: "1.15rem", fontWeight: 600, margin: "14px auto 26px", maxWidth: 460 }}>
            Pickup in Scarborough or get them delivered. One bite and you&apos;ll get it.
          </p>
          <div className="flex wrap-gap" style={{ justifyContent: "center" }}>
            <Btn page="order" variant="green" size="lg">🛵 Order Now</Btn>
            <Btn page="eats" variant="ink" size="lg">See Full Menu</Btn>
          </div>
        </div>
      </section>
    </div>
  );
}
