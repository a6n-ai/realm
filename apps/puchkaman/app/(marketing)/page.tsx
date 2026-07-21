import Link from "next/link";
import type { CSSProperties } from "react";
import type { FileDetail } from "@realm/storage/model";
import { Btn, Marquee, Ph, Pill, SectionHead, Stars } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";
import { ProductImage } from "@/components/products/product-image";
import { productsService } from "@/lib/services/products.service";
import { CATEGORIES, type CategoryId, TAG_STYLE } from "@/lib/menu-categories";

// Home reads live products (real photos rehosted to our storage). force-dynamic
// so newly featured/synced items and their images show without a rebuild.
export const dynamic = "force-dynamic";

type BestSellerCard = { name: string; tag: string; desc: string; price: string; sticker?: string; sv?: string; image: FileDetail | null };

// Static fallback (no photos) for a fresh DB with nothing marked featured yet.
const BEST_SELLERS: Omit<BestSellerCard, "image">[] = [
  { name: "Aloo Puchka", tag: "Classic", desc: "Spiced potato, tangy tamarind water, the OG crunch.", price: "$6", sticker: "#1 SELLER", sv: "red" },
  { name: "Dahi Puchka", tag: "Cooling", desc: "Crispy shells loaded with sweet yogurt & chutneys.", price: "$7" },
  { name: "Fusion Puchkas", tag: "Viral", desc: "Chicken corn cheese, schezwan paneer & more.", price: "$9", sticker: "🔥 VIRAL", sv: "red" },
  { name: "Vada Pav", tag: "Bombay", desc: "Mumbai's spicy potato slider with garlic chutney.", price: "$6" },
  { name: "Pav Bhaji", tag: "Buttery", desc: "Mashed veg curry, toasted buttery pav, lime.", price: "$10" },
  { name: "Kathi Rolls", tag: "Wrapped", desc: "Flaky paratha rolled with smoky fillings.", price: "$9" },
];

const REVIEWS = [
  { n: "Priya S.", t: "The fusion puchkas are unreal. Chicken corn cheese changed my life. Best chaat in Scarborough hands down.", r: 5 },
  { n: "Rahul M.", t: "Tastes exactly like Kolkata streets. The puchka water is *perfect*. We come every weekend now.", r: 5 },
  { n: "Aisha K.", t: "Booked them for my daughter's birthday — live puchka station was the hit of the party!", r: 5 },
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
  const featured = await productsService.featuredProducts(6);
  const withPhoto = (await productsService.listActive()).filter((p) => p.image);
  const picks = featured.length ? featured : withPhoto.slice(0, 6);
  const cards: BestSellerCard[] = picks.length
    ? picks.map((p) => {
        const badge = (p.tags ?? []).find((t) => TAG_STYLE[t]);
        return {
          name: p.name,
          tag: CATEGORIES[p.category as CategoryId]?.name ?? p.category,
          desc: p.description ?? "",
          price: `$${Number(p.price).toFixed(0)}`,
          sticker: badge ? TAG_STYLE[badge].label : undefined,
          sv: badge && TAG_STYLE[badge].variant === "red" ? "red" : undefined,
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
  const heroUrl =
    (withPhoto.find((p) => (p.tags ?? []).includes("viral"))?.image as FileDetail | null)?.url ??
    photoUrls[0] ??
    null;
  const fusionUrl = photoUrls.find((u) => u !== heroUrl) ?? heroUrl;
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
                <Pill variant="red">★ 4.8 · 119+ Google Reviews</Pill>
                <Pill variant="ink">Scarborough · GTA</Pill>
              </div>
              <h1 className="display anim" style={{ fontSize: "clamp(2.6rem, 8vw, 5rem)", "--d": ".13s" } as CSSProperties}>
                Toronto&apos;s <span className="marker" style={{ color: "#fff" }}>First</span> Fusion Puchka Spot
              </h1>
              <p className="anim" style={{ fontSize: "1.18rem", fontWeight: 600, maxWidth: 520, marginTop: 22, lineHeight: 1.45, "--d": ".22s" } as CSSProperties}>
                Fusion puchkas, Kolkata street food, kathi rolls, chaats, summer drinks & more — made fresh in Scarborough.
              </p>
              <div className="flex wrap-gap anim" style={{ marginTop: 30, "--d": ".3s" } as CSSProperties}>
                <Btn page="order" variant="red" size="lg">🛵 Order Pickup</Btn>
                <Btn page="order" variant="ink" size="lg">🚗 Order Delivery</Btn>
              </div>
              <div className="flex wrap-gap anim" style={{ marginTop: 14, "--d": ".38s" } as CSSProperties}>
                <Btn page="menu" size="lg">📖 View Menu</Btn>
                <Btn page="catering" variant="yellow" size="lg">🎉 Book Catering</Btn>
              </div>
            </div>

            {/* hero image — layered on a colored backing block */}
            <div className="hero-art" style={{ position: "relative", maxWidth: 460, width: "100%", marginInline: "auto" }}>
              <div
                aria-hidden="true"
                style={{ position: "absolute", inset: 0, transform: "translate(16px, 18px) rotate(3deg)", background: "var(--ink-bg)", border: "var(--border)", borderRadius: "var(--r)" }}
              />
              {heroUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroUrl}
                  alt="Fusion puchkas — Puchkaman"
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
              ) : (
                <Ph label="HERO SHOT — overflowing plate of fusion puchkas" ratio="4 / 4.3" mod="rotate-r" style={{ position: "relative", boxShadow: "none" }} />
              )}
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
              <Reveal key={d.name} delay={i * 60}>
                <Link href="/productsmenu" className="card card--lift" style={{ display: "block", overflow: "hidden", height: "100%" }}>
                  <div style={{ position: "relative" }}>
                    <ProductImage image={d.image} name={d.name} />
                    {d.sticker && (
                      <span
                        className="sticker rotate-l"
                        style={{ top: 12, left: 12, background: d.sv === "red" ? "var(--red)" : "var(--yellow)", color: d.sv === "red" ? "#fff" : "var(--ink-deep)" }}
                      >
                        {d.sticker}
                      </span>
                    )}
                  </div>
                  <div style={{ padding: "18px 18px 20px" }}>
                    <div className="flex center between" style={{ marginBottom: 8 }}>
                      <Pill>{d.tag}</Pill>
                      <span className="display" style={{ fontSize: "1.4rem", color: "var(--red)" }}>{d.price}</span>
                    </div>
                    <h3 style={{ fontSize: "1.5rem", marginBottom: 6 }}>{d.name}</h3>
                    <p style={{ fontWeight: 500, opacity: 0.82, fontSize: "0.96rem" }}>{d.desc}</p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
          <div className="tac" style={{ marginTop: 40 }}>
            <Btn page="menu" variant="ink" size="lg">See the Full Menu →</Btn>
          </div>
        </div>
      </section>

      {/* ===== FUSION TEASER ===== */}
      <section className="section-pad surface-red" style={{ background: "var(--red)", color: "#fff", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <div className="hero-grid" style={{ display: "grid", gap: 40, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              {fusionUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fusionUrl}
                  alt="Fusion puchka close-up"
                  className="rotate-l"
                  style={{ display: "block", width: "100%", aspectRatio: "4 / 3.2", objectFit: "cover", border: "var(--border)", borderRadius: "var(--r)", boxShadow: "10px 10px 0 var(--ink)" }}
                />
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
                <Btn page="menu" variant="white" size="lg">See Fusion Menu</Btn>
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
              <span className="tape kicker">@puchkaman</span>
              <h2 className="display" style={{ fontSize: "clamp(1.9rem, 5vw, 3rem)", marginTop: 12 }}>Straight From The &apos;Gram</h2>
            </div>
            <Btn page="contact" variant="red" size="lg">Follow Us ↗</Btn>
          </div>
          <div className="grid ig-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
            {["Reel · puchka pour", "Reel · cheese pull", "Post · combo box", "Reel · catering setup", "Post · summer drinks", "Reel · kathi roll"].map((l, i) => (
              <div key={i} style={{ position: "relative" }}>
                {galleryUrls[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={galleryUrls[i]}
                    alt={l}
                    loading="lazy"
                    className="card--lift"
                    style={{ display: "block", width: "100%", aspectRatio: "1 / 1", objectFit: "cover", border: "var(--border)", borderRadius: "var(--r)" }}
                  />
                ) : (
                  <Ph label={l} ratio="1 / 1" className="card--lift" />
                )}
                <span style={{ position: "absolute", top: 8, right: 8, fontSize: 18 }}>{l.startsWith("Reel") ? "▶" : "◳"}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== EVENTS TEASER / CTA ===== */}
      <section className="section-pad" style={{ background: "var(--page-bg)" }}>
        <div className="wrap">
          <div className="card card--ink surface-ink" style={{ color: "var(--cream)", padding: "clamp(28px, 5vw, 56px)", overflow: "hidden", position: "relative" }}>
            <div className="hero-grid" style={{ display: "grid", gap: 30, alignItems: "center" }}>
              <div>
                <span className="tape kicker" style={{ background: "var(--red)", color: "#fff" }}>Scarborough&apos;s Fan Hub</span>
                <h2 className="display" style={{ fontSize: "clamp(2rem, 5.5vw, 3.4rem)", color: "var(--yellow)", marginTop: 16 }}>Watch Parties & Game Nights</h2>
                <p style={{ fontWeight: 500, fontSize: "1.08rem", marginTop: 14, maxWidth: 460 }}>
                  Cricket, football & big-match nights with limited seating (30–35), event combos and live puchkas. Reserve your spot before it&apos;s gone.
                </p>
                <div className="flex wrap-gap" style={{ marginTop: 24 }}>
                  <Btn page="events" variant="red" size="lg">Reserve Your Spot →</Btn>
                  <Btn page="events" variant="yellow" size="lg">See Upcoming</Btn>
                </div>
              </div>
              <Ph label="Past watch party — packed house" ratio="4 / 3" mod="rotate-r" style={{ boxShadow: "8px 8px 0 var(--red)" }} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
