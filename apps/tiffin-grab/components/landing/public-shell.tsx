import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { pageOf } from "@/lib/routing/public-pages";
import { BuildTiffinLink } from "@/components/landing/build-tiffin-link";
import { Suspense, type ReactNode } from "react";
import { PageTransition } from "@/components/motion/page-transition";
import { LandingHeader } from "@/components/landing/landing-header";
import { NavRating, reviewsConnected } from "@/components/landing/landing-reviews";
import { CookieSettingsButton } from "@/components/consent/cookie-consent";
import { LocationPicker } from "@/components/marketing/location-picker";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { loadReferralOffer } from "@/lib/referrals/offer";
import { loadLandingPromos } from "@/lib/landing/promos";
import { referHeadline } from "@/lib/referrals/headline";
import { ActionPill } from "@/components/landing/refer/action-pill";
import { EdgeTint } from "@/components/landing/edge-tint";
import { WebMcpTools } from "@/components/landing/web-mcp-tools";
import { areaSlug } from "@/lib/landing/areas";

// One shell for every public page: the landing header, the ink close band and
// the location picker. .customer-app opts in to the customer design system.
// The public site has one look whatever the visitor's theme: .tg-light-root pins the cream
// tokens and chosen bands opt into dark green with .dark (the toggle lives in /me and the dashboard).
export async function PublicShell({ children }: { children: ReactNode }) {
  const [offer, promos] = await Promise.all([loadReferralOffer(), loadLandingPromos()]);
  const sticker = promos?.sticker ?? null;
  // The dock's promotion face: the computed saving when there is one, else the promo's own badge.
  const dockPromo = sticker ? { text: sticker.savings?.headline ?? sticker.badge ?? sticker.title, code: sticker.code, href: sticker.href } : null;
  return (
    <div className="tg-light-root">
    <div className="tg-land customer-app">
      <WebMcpTools />
      <LandingHeader refer={offer?.on ?? false} rating={<Suspense fallback={null}><NavRating /></Suspense>} />
      {/* Route changes cross-fade the page under a header that stays put (see landing.css). Keyed by
          path: an unkeyed default also ran on every streamed Suspense reveal, so the first visit
          faded the whole page out and back in, and swallowed taps while it played. */}
      <main id="main"><PageTransition fade="tg-page">{children}</PageTransition></main>
      <PublicFooter />
      <LocationPicker />
      <ActionPill label={offer?.pillLabel ?? null} refer={offer?.on ? referHeadline(offer).replace(/\.$/, "") : null} promo={dockPromo} />
      <EdgeTint />
    </div>
    </div>
  );
}

// Swish-style close: a saffron band with die-cut stickers, link columns and a giant
// wordmark. Stickers only say what the site already says (home-style, small batches, GTA).
async function PublicFooter() {
  const [catalog, showReviews] = await Promise.all([loadCatalogSnapshot().catch(() => null), reviewsConnected()]);
  const zones = catalog?.zones.filter((z) => z.active).map((z) => z.name) ?? [];
  return (
    <footer className="tg-close">
      <div className="tg-wrap tg-close__grid">
        <div className="tg-close__lead">
          <span className="tg-sticker tg-sticker--tag" aria-hidden>
            <small>proper</small>
            <span>Ghar ka<br />khana</span>
            <small>delivered</small>
          </span>
          <h2 className="tg-h2 max-w-[14ch]">Your first tiffin, your <span className="c-accent">way.</span></h2>
          <div><BuildTiffinLink className="tg-cta">Build my tiffin</BuildTiffinLink></div>
        </div>
        <div className="tg-close__cols">
          <nav aria-label="Site">
            <strong>{BRAND_NAME}</strong>
            <Link href="/menu">{pageOf("/menu").label}</Link>
            <Link href="/pricing">{pageOf("/pricing").label}</Link>
            {showReviews ? <Link href="/reviews">{pageOf("/reviews").label}</Link> : null}
            <Link href="/faq">{pageOf("/faq").label}</Link>
            <Link href="/about">{pageOf("/about").label}</Link>
          </nav>
          <nav aria-label="Help">
            <strong>Help</strong>
            <Link href="/contact">{pageOf("/contact").label}</Link>
            <Link href="/locations">{pageOf("/locations").label}</Link>
            <Link prefetch={false} href="/me/support">Support</Link>
          </nav>
          <nav aria-label="Legal">
            <strong>Legal</strong>
            <Link href="/terms">{pageOf("/terms").label}</Link>
            <Link href="/privacy">{pageOf("/privacy").label}</Link>
            <Link href="/refund-policy">{pageOf("/refund-policy").label}</Link>
            <Link href="/delivery-policy">{pageOf("/delivery-policy").label}</Link>
          </nav>
        </div>
      </div>
      <div className="tg-wrap tg-close__meta">
        {zones.length > 0 ? (
          <>
            <p className="tg-close__zones">
              Delivering to{" "}
              {zones.map((z, i) => (
                <span key={z}>
                  {/* Each area's row on /locations (#brampton), from every page. */}
                  <Link href={`/locations#${areaSlug(z)}`} className="underline underline-offset-2 transition-colors hover:text-[var(--tg-ink-warm)]">{z}</Link>
                  {i < zones.length - 1 ? ", " : "."}
                </span>
              ))}
            </p>
            {/* Phones: the count and a way to the list, not an eleven-name sentence. */}
            <p className="tg-close__zones-short">Delivering to {zones.length} areas across the GTA. <Link href="/locations">See the areas</Link></p>
          </>
        ) : null}
        <p>© {new Date().getFullYear()} {BRAND_NAME} · <CookieSettingsButton className="tg-close__cookie" /></p>
      </div>
      <div className="tg-close__base">
        {/* Drawn by CSS (content: attr) so the decorative watermark is not read as low-contrast text. */}
        <div className="tg-close__mark" aria-hidden data-mark="tiffin grab" />
        <svg className="tg-sticker tg-sticker--round" viewBox="0 0 200 200" aria-hidden>
          <defs><path id="tg-sticker-ring" d="M100,100 m-72,0 a72,72 0 1,1 144,0 a72,72 0 1,1 -144,0" /></defs>
          <circle cx="100" cy="100" r="96" fill="#FBF4E7" />
          <circle cx="100" cy="100" r="88" fill="#2A5440" />
          <text className="tg-sticker__ring"><textPath href="#tg-sticker-ring" startOffset="0">SMALL BATCHES ✦ HOME‑STYLE ✦ ACROSS THE GTA ✦</textPath></text>
          <image href="/brand/mark.svg" x="62" y="62" width="76" height="76" />
        </svg>
      </div>
    </footer>
  );
}

// The loading state of an inner page: only its title block (eyebrow, two-line h1, lede), in the same
// wrapper and widths as PageIntro so nothing shifts when the page lands. The dock's line carries progress.
// Catalogue names use dashes ("Sabzi Only — Regular"); the public site reads them as "Sabzi Only · Regular", as home does.
export const dashless = (name: string) => name.replace(/\s+[—–]\s+/g, " · ");

// Inner-page title block, the home hero's type at page scale: kicker, a display h1 with its italic
// saffron accent word, a lede, and the page's actions when it has them. Every inner page uses it, so titles match.
export function PageIntro({ eyebrow, title, lede, children }: { eyebrow?: string; title: ReactNode; lede?: ReactNode; children?: ReactNode }) {
  return (
    <header className="lp-intro">
      {eyebrow ? <span className="lp-kicker">{eyebrow}</span> : null}
      <h1 className="lp-display lp-display--page">{title}</h1>
      {lede ? <p className="lp-lede">{lede}</p> : null}
      {children}
    </header>
  );
}
