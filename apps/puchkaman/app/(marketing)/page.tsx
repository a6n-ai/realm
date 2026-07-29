import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { FileDetail } from "@realm/storage/model";
import { Btn, Marquee, Ph, Pill, SectionHead, Stars } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";
import { HeroVideo } from "@/components/brutal/hero-video";
import { ProductImage } from "@/components/products/product-image";
import { productsService } from "@/lib/services/products.service";
import { CATEGORIES, type CategoryId, TAG_STYLE } from "@/lib/menu-categories";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Puchkaman · Toronto's First Fusion Puchka Spot · Scarborough",
  description:
    "Puchkaman — Scarborough's fusion puchka & Indian street food spot. Pani puri, golgappa, chaat, kathi rolls, vada pav, pav bhaji. Pickup, delivery & live catering across the GTA.",
  path: "/",
});

// Home reads live products (real photos rehosted to our storage). force-dynamic
// so newly featured/synced items and their images show without a rebuild.
//
// Tried switching this to ISR (`revalidate = 60`) for a caching win, but the CI
// Docker build has no real DB at build time (only a fake unreachable
// DATABASE_URL placeholder) and Next tries to prerender ISR/static pages during
// `next build`, which crashed the build with ECONNREFUSED. Revisit once the
// build pipeline has a real build-time Postgres (see the failed 2026-07-28
// deploy + follow-up task for adding one).
export const dynamic = "force-dynamic";

// `key` is a stable React key — product *names* aren't unique (the catalog
// genuinely has multiple distinct products sharing a display name), so
// keying by name collides. publicId for real products, a static string for
// the hardcoded fallback (already unique there).
type BestSellerCard = { key: string; name: string; tag: string; desc: string; price: string; sticker?: string; sv?: string; image: FileDetail | null };

// Static fallback (no photos) for a fresh DB with nothing marked featured yet.
const BEST_SELLERS: Omit<BestSellerCard, "image">[] = [
  { key: "aloo-puchka", name: "Aloo Puchka", tag: "Classic", desc: "Spiced potato, tangy tamarind water, the OG crunch.", price: "$6", sticker: "#1 SELLER", sv: "green" },
  { key: "dahi-puchka", name: "Dahi Puchka", tag: "Cooling", desc: "Crispy shells loaded with sweet yogurt & chutneys.", price: "$7" },
  { key: "fusion-puchkas", name: "Fusion Puchkas", tag: "Viral", desc: "Chicken corn cheese, schezwan paneer & more.", price: "$9", sticker: "🔥 VIRAL", sv: "green" },
  { key: "vada-pav", name: "Vada Pav", tag: "Bombay", desc: "Mumbai's spicy potato slider with garlic chutney.", price: "$6" },
  { key: "pav-bhaji", name: "Pav Bhaji", tag: "Buttery", desc: "Mashed veg curry, toasted buttery pav, lime.", price: "$10" },
  { key: "kathi-rolls", name: "Kathi Rolls", tag: "Wrapped", desc: "Flaky paratha rolled with smoky fillings.", price: "$9" },
];

const REVIEWS = [
  { n: "Priya S.", t: "The fusion puchkas are unreal. Chicken corn cheese changed my life. Best chaat in Scarborough hands down.", r: 5 },
  { n: "Rahul M.", t: "Tastes exactly like Kolkata streets. The puchka water is *perfect*. We come every weekend now.", r: 5 },
  { n: "Aisha K.", t: "Booked them for my daughter's birthday — live puchka station was the hit of the party!", r: 5 },
];

// Real reels from @puchkamancanada, picked by hand, each with its actual cover
// frame (the reel's public og:image, downloaded once into public/instagram/
// rather than hotlinked — Instagram has no public API for this and gates
// thumbnails behind login for logged-out visitors). Every tile links out to
// the real reel — clicking plays the real video on Instagram.
const INSTAGRAM_REELS: { url: string; thumbnail?: string }[] = [
  { url: "https://www.instagram.com/reel/DX7gkx6OSGS/", thumbnail: "/instagram/reel-DX7gkx6OSGS.jpg" },
  { url: "https://www.instagram.com/reel/DXbuVG8kezT/", thumbnail: "/instagram/reel-DXbuVG8kezT.jpg" },
  { url: "https://www.instagram.com/reel/DXIU0CHEQBj/", thumbnail: "/instagram/reel-DXIU0CHEQBj.jpg" },
  { url: "https://www.instagram.com/reel/DV1qr9VE3zA/", thumbnail: "/instagram/reel-DV1qr9VE3zA.jpg" },
  { url: "https://www.instagram.com/reel/DTikLkokYyX/", thumbnail: "/instagram/reel-DTikLkokYyX.jpg" },
  { url: "https://www.instagram.com/reel/DYAWaeouRci/", thumbnail: "/instagram/reel-DYAWaeouRci.jpg" },
];

const COMBOS = [
  { e: "🥤", t: "Summer Drinks", d: "Masala soda, rose lassi, cold coffee & more to beat the GTA heat.", cta: "Sip the menu", pg: "menu", bg: "var(--white)" },
  { e: "🍱", t: "Combos & Deals", d: "Mix puchkas + a roll + a drink and save. Built for sharing.", cta: "See combos", pg: "menu", bg: "var(--cream)" },
  { e: "🎉", t: "Live Catering", d: "Live puchka & chaat stations for any event across the GTA.", cta: "Get a quote", pg: "catering", bg: "var(--white)" },
];

export default async function HomePage() {
  // Curated "featured" products first; if none are flagged, fall back to real
  // active products that have a photo (so home shows the actual menu, not empty
  // placeholder tiles). Static BEST_SELLERS is the last resort for a fresh DB.
  const [featured, active] = await Promise.all([
    productsService.featuredProducts(6),
    productsService.listActive(),
  ]);
  const withPhoto = active.filter((p) => p.image);
  const picks = featured.length ? featured : withPhoto.slice(0, 6);
  const cards: BestSellerCard[] = picks.length
    ? picks.map((p) => {
        const badge = (p.tags ?? []).find((t) => TAG_STYLE[t]);
        return {
          key: p.publicId,
          name: p.name,
          tag: CATEGORIES[p.category as CategoryId]?.name ?? p.category,
          desc: p.description ?? "",
          price: `$${Number(p.price).toFixed(0)}`,
          sticker: badge ? TAG_STYLE[badge].label : undefined,
          sv: badge && TAG_STYLE[badge].variant === "green" ? "green" : undefined,
          image: (p.image as FileDetail | null) ?? null,
        };
      })
    : BEST_SELLERS.map((d) => ({ ...d, image: null }));

  // Reuse real product photos across the home marketing sections (hero, fusion
  // teaser, Instagram grid) so they aren't striped placeholders once the menu
  // has images. Each falls back to its Ph tile when no photo is available.
  const photoUrls = withPhoto
    .map((p) => (p.image as FileDetail | null)?.url)
    .filter((u): u is string => !!u);
  // Hero + fusion teaser both showcase the fusion range (the brand hero product),
  // preferring a viral-tagged fusion dish, never e.g. vada pav. Pick two distinct
  // photos when the menu has more than one fusion item.
  const fusionPhotos = withPhoto.filter((p) => p.category === "fusion");
  const heroUrl =
    (fusionPhotos.find((p) => (p.tags ?? []).includes("viral"))?.image as FileDetail | null)?.url ??
    (fusionPhotos[0]?.image as FileDetail | null)?.url ??
    (withPhoto.find((p) => (p.tags ?? []).includes("viral"))?.image as FileDetail | null)?.url ??
    photoUrls[0] ??
    null;
  const fusionUrl =
    (fusionPhotos.find((p) => (p.image as FileDetail | null)?.url !== heroUrl)?.image as FileDetail | null)?.url ??
    (fusionPhotos[0]?.image as FileDetail | null)?.url ??
    photoUrls.find((u) => u !== heroUrl) ??
    heroUrl;
  const galleryUrls = photoUrls.slice(0, 6);

  return (
    <div>
      {/* ===== ANNOUNCEMENT RIBBON ===== */}
      <div className="ribbon">
        <div className="ribbon__track">
          {[0, 1].map((k) => (
            <span key={k}>
              <span>🔥 Now serving fusion puchkas</span>
              <span>★ 4.8 on Google · 119+ reviews</span>
              <span>🛵 Order pickup & skip the fees</span>
              <span>📍 3315 Danforth Ave, Scarborough</span>
            </span>
          ))}
        </div>
      </div>

      {/* ===== HERO ===== */}
      <section className="hero-bg" style={{ position: "relative", overflow: "hidden", borderBottom: "var(--border)" }}>
        <div className="wrap" style={{ padding: "48px 20px 72px" }}>
          <div className="hero-grid" style={{ display: "grid", gap: 48, alignItems: "center" }}>
            <div>
              <div className="flex wrap-gap anim" style={{ marginBottom: 22, "--d": ".05s" } as CSSProperties}>
                <Pill variant="green">★ 4.8 · 119+ Google Reviews</Pill>
                <Pill variant="ink">Scarborough · GTA</Pill>
              </div>
              <h1 className="display anim" style={{ fontSize: "clamp(2.6rem, 8vw, 5rem)", "--d": ".13s" } as CSSProperties}>
                Toronto&apos;s <span className="marker" style={{ color: "#fff" }}>First</span> Fusion Puchka Spot
              </h1>
              <p className="anim" style={{ fontSize: "1.18rem", fontWeight: 600, maxWidth: 520, marginTop: 22, lineHeight: 1.45, "--d": ".22s" } as CSSProperties}>
                Fusion puchkas, Kolkata street food, kathi rolls, chaats, summer drinks & more — made fresh in Scarborough.
              </p>
              <div className="flex wrap-gap anim" style={{ marginTop: 30, "--d": ".3s" } as CSSProperties}>
                <Btn page="order" variant="green" size="lg">🛵 Order Pickup</Btn>
                <Btn page="order" variant="ink" size="lg">🚗 Order Delivery</Btn>
              </div>
              <div className="flex wrap-gap anim" style={{ marginTop: 14, "--d": ".38s" } as CSSProperties}>
                <Btn page="eats" size="lg">📖 View Menu</Btn>
                <Btn page="catering" variant="yellow" size="lg">🎉 Book Catering</Btn>
              </div>
            </div>

            {/* hero image — layered on a colored backing block */}
            <div className="hero-art" style={{ position: "relative", maxWidth: 460, width: "100%", marginInline: "auto" }}>
              <div
                aria-hidden="true"
                style={{ position: "absolute", inset: 0, transform: "translate(16px, 18px) rotate(3deg)", background: "var(--ink-bg)", border: "var(--border)", borderRadius: "var(--r)" }}
              />
              <HeroVideo
                src="/hero/chocolate-puchka.mp4"
                poster="/hero/chocolate-puchka-poster.jpg"
                ariaLabel="Chocolate puchkas — Puchkaman"
                className="rotate-r"
                style={{
                  position: "relative",
                  display: "block",
                  width: "100%",
                  aspectRatio: "4 / 4.3",
                  objectFit: "cover",
                  border: "var(--border)",
                  borderRadius: "var(--r)",
                  boxShadow: "none",
                }}
              />
              <span className="sticker float-l" style={{ top: -16, left: -10, background: "var(--yellow)", color: "var(--ink-deep)" }}>FRESH DAILY</span>
              <span className="sticker float-r" style={{ bottom: 22, right: -14, fontSize: "0.95rem" }}>🔥 NEW: SUMMER DRINKS</span>
              <div className="card" style={{ position: "absolute", bottom: -22, left: -18, padding: "12px 16px", background: "var(--white)", display: "flex", alignItems: "center", gap: 10, zIndex: 4 }}>
                <Stars value={4.8} size={20} />
                <span style={{ fontWeight: 900, fontSize: "1.15rem" }}>4.8</span>
                <span className="mono" style={{ fontSize: "0.72rem", opacity: 0.7 }}>119+<br />reviews</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Marquee items={["PANI PURI", "GOLGAPPA", "PUCHKA", "GUPCHUP", "CHAAT", "KATHI ROLLS", "VADA PAV", "MOMOS"]} />

      {/* ===== BEST SELLERS ===== */}
      <section className="section-pad" style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <SectionHead kicker="Crowd Favourites" title="The Best Sellers" sub="The dishes Scarborough keeps coming back for. Tap any to see the full menu." />
          <div className="grid bs-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {cards.map((d, i) => (
              <Reveal key={d.key} delay={i * 60}>
                <Link href="/eats" className="card card--lift" style={{ display: "block", overflow: "hidden", height: "100%" }}>
                  <div style={{ position: "relative" }}>
                    <ProductImage image={d.image} name={d.name} />
                    {d.sticker && (
                      <span
                        className="sticker rotate-l"
                        style={{ top: 12, left: 12, background: d.sv === "green" ? "var(--green)" : "var(--yellow)", color: d.sv === "green" ? "#fff" : "var(--ink-deep)" }}
                      >
                        {d.sticker}
                      </span>
                    )}
                  </div>
                  <div style={{ padding: "18px 18px 20px" }}>
                    <div className="flex center between" style={{ marginBottom: 8 }}>
                      <Pill>{d.tag}</Pill>
                      <span className="display" style={{ fontSize: "1.4rem", color: "var(--green)" }}>{d.price}</span>
                    </div>
                    <h3 style={{ fontSize: "1.5rem", marginBottom: 6 }}>{d.name}</h3>
                    <p style={{ fontWeight: 500, opacity: 0.82, fontSize: "0.96rem" }}>{d.desc}</p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
          <div className="tac" style={{ marginTop: 40 }}>
            <Btn page="eats" variant="ink" size="lg">See the Full Menu →</Btn>
          </div>
        </div>
      </section>

      {/* ===== FUSION TEASER ===== */}
      <section className="section-pad surface-green" style={{ background: "var(--green)", color: "#fff", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <div className="hero-grid" style={{ display: "grid", gap: 40, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              {fusionUrl ? (
                <div className="rotate-l" style={{ position: "relative", width: "100%", aspectRatio: "4 / 3.2", border: "var(--border)", borderRadius: "var(--r)", boxShadow: "10px 10px 0 var(--ink)", overflow: "hidden" }}>
                  <Image
                    src={fusionUrl}
                    alt="Fusion puchka close-up"
                    fill
                    sizes="(min-width: 880px) 45vw, 90vw"
                    style={{ objectFit: "cover" }}
                  />
                </div>
              ) : (
                <Ph label="Fusion puchka close-up — cheese pull" ratio="4 / 3.2" mod="rotate-l" style={{ boxShadow: "10px 10px 0 var(--ink)" }} />
              )}
              <span className="sticker rotate-r" style={{ top: -14, right: -10, background: "var(--yellow)", color: "var(--ink-deep)" }}>NEVER TRIED IT?</span>
            </div>
            <div>
              <span className="tape kicker" style={{ background: "var(--ink)", color: "var(--yellow)" }}>The Hero Product</span>
              <h2 className="display" style={{ fontSize: "clamp(2.2rem, 6vw, 3.8rem)", marginTop: 16 }}>What On Earth Is a Fusion Puchka?</h2>
              <p style={{ fontSize: "1.12rem", fontWeight: 500, marginTop: 16, maxWidth: 480 }}>
                Crispy puchka shells, stuffed with bold global flavours — chicken corn cheese, schezwan paneer, spicy chicken blast. One bite and you get the hype.
              </p>
              <div className="flex wrap-gap" style={{ marginTop: 26 }}>
                <Btn page="fusion" variant="yellow" size="lg">Learn How To Eat It →</Btn>
                <Btn page="eats" variant="white" size="lg">See Fusion Menu</Btn>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SUMMER DRINKS + COMBOS STRIP ===== */}
      <section className="section-pad" style={{ background: "var(--page-bg)", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {COMBOS.map((c) => (
              <Reveal key={c.t}>
                <div className="card" style={{ padding: 26, background: c.bg, height: "100%" }}>
                  <div style={{ fontSize: 42, marginBottom: 10 }}>{c.e}</div>
                  <h3 style={{ fontSize: "1.6rem", marginBottom: 8 }}>{c.t}</h3>
                  <p style={{ fontWeight: 500, opacity: 0.85, marginBottom: 18 }}>{c.d}</p>
                  <Btn page={c.pg} variant="ink" size="sm">{c.cta} →</Btn>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== REVIEWS ===== */}
      <section className="section-pad surface-ink" style={{ background: "var(--ink)", color: "var(--cream)", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <SectionHead kicker="Social Proof" title="Scarborough Is Obsessed" light sub="4.8★ across 119+ Google reviews. Here's what the neighbourhood says." />
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))" }}>
            {REVIEWS.map((rv, i) => (
              <Reveal key={rv.n} delay={i * 70}>
                <div className="card" style={{ background: "var(--white)", color: "var(--ink)", padding: 24, height: "100%" }}>
                  <Stars value={rv.r} size={18} />
                  <p style={{ fontWeight: 600, fontSize: "1.05rem", margin: "14px 0 18px", lineHeight: 1.5 }}>&ldquo;{rv.t}&rdquo;</p>
                  <div className="flex center" style={{ gap: 10 }}>
                    <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--yellow)", border: "2.5px solid var(--ink)", display: "grid", placeItems: "center", fontWeight: 900 }}>
                      {rv.n[0]}
                    </span>
                    <div>
                      <div style={{ fontWeight: 800 }}>{rv.n}</div>
                      <div className="mono" style={{ fontSize: "0.7rem", opacity: 0.6 }}>Google Review · Verified</div>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== INSTAGRAM ===== */}
      <section className="section-pad" style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <div className="flex center between wrap-gap" style={{ marginBottom: 28 }}>
            <div>
              <span className="tape kicker">@puchkamancanada</span>
              <h2 className="display" style={{ fontSize: "clamp(1.9rem, 5vw, 3rem)", marginTop: 12 }}>Straight From The &apos;Gram</h2>
            </div>
            <Btn href="https://www.instagram.com/puchkamancanada/" variant="green" size="lg">Follow Us ↗</Btn>
          </div>
          <div className="grid ig-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
            {INSTAGRAM_REELS.map((reel, i) => {
              const thumbnail = reel.thumbnail ?? galleryUrls[i];
              return (
                <a
                  key={reel.url}
                  href={reel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Watch reel on Instagram (opens in a new tab)"
                  style={{ position: "relative", display: "block" }}
                >
                  {thumbnail ? (
                    <div
                      className="card--lift"
                      style={{
                        position: "relative",
                        width: "100%",
                        aspectRatio: "4 / 5",
                        border: "var(--border)",
                        borderRadius: "var(--r)",
                        overflow: "hidden",
                      }}
                    >
                      <Image
                        src={thumbnail}
                        // Decorative: the parent <a>'s aria-label already gives the
                        // accessible name — a second text alt here would double-announce.
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 16vw, (min-width: 640px) 30vw, 45vw"
                        style={{ objectFit: "cover", objectPosition: "center 25%" }}
                      />
                    </div>
                  ) : (
                    <Ph label="Reel" ratio="4 / 5" className="card--lift" />
                  )}
                  <span style={{ position: "absolute", top: 8, right: 8, fontSize: 18 }}>▶</span>
                </a>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
