import Link from "next/link";
import { Suspense, ViewTransition, type ReactNode } from "react";
import { LandingHeader } from "@/components/landing/landing-header";
import { NavRating, reviewsConnected } from "@/components/landing/landing-reviews";
import { WhatsAppChat } from "@/components/landing/whats-app-chat";
import { LocationPicker } from "@/components/marketing/location-picker";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import "@/components/landing/landing.css";

// One shell for every public page: the landing header, the ink close band and
// the location picker. .customer-app opts in to the customer design system.
// The public site has one look whatever the visitor's theme: .tg-light-root pins the cream
// tokens and chosen bands opt into dark green with .dark (the toggle lives in /me and the dashboard).
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="tg-light-root">
    <div className="tg-land customer-app">
      <LandingHeader rating={<Suspense fallback={null}><NavRating /></Suspense>} />
      {/* Route changes cross-fade the page under a header that stays put (see landing.css). */}
      <main id="main"><ViewTransition default="tg-page">{children}</ViewTransition></main>
      <PublicFooter />
      <LocationPicker />
      <WhatsAppChat />
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
          <div><Link prefetch={false} href="/subscribe" className="tg-cta">Build my tiffin</Link></div>
        </div>
        <div className="tg-close__cols">
          <nav aria-label="Site">
            <strong>Tiffin Grab</strong>
            <Link href="/menu/weekly">Menu</Link>
            <Link href="/plans">Plans</Link>
            <Link href="/pricing">Pricing</Link>
            {showReviews ? <Link href="/reviews">Reviews</Link> : null}
            <Link href="/faq">FAQ</Link>
          </nav>
          <nav aria-label="Help">
            <strong>Help</strong>
            <Link href="/contact">Contact</Link>
            <Link href="/locations">Locations</Link>
            <Link href="/me/support">Support</Link>
          </nav>
          <nav aria-label="Legal">
            <strong>Legal</strong>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/refund-policy">Refunds</Link>
            <Link href="/delivery-policy">Delivery</Link>
          </nav>
        </div>
      </div>
      <div className="tg-wrap tg-close__meta">
        {zones.length > 0 ? <p>Delivering to {zones.join(", ")}.</p> : null}
        <p>© {new Date().getFullYear()} Tiffin Grab</p>
      </div>
      <div className="tg-close__base">
        <div className="tg-close__mark" aria-hidden>tiffin grab</div>
        <svg className="tg-sticker tg-sticker--round" viewBox="0 0 200 200" aria-hidden>
          <defs><path id="tg-sticker-ring" d="M100,100 m-72,0 a72,72 0 1,1 144,0 a72,72 0 1,1 -144,0" /></defs>
          <circle cx="100" cy="100" r="96" fill="#FBF4E7" />
          <circle cx="100" cy="100" r="88" fill="#1F2E26" />
          <text className="tg-sticker__ring"><textPath href="#tg-sticker-ring" startOffset="0">SMALL BATCHES · HOME‑STYLE · ACROSS THE GTA ·</textPath></text>
          <image href="/brand/mark.svg" x="62" y="62" width="76" height="76" />
        </svg>
      </div>
    </footer>
  );
}

// Inner-page title block: eyebrow, one h1 with its saffron accent word, a lede.
export function PageIntro({ eyebrow, title, lede }: { eyebrow?: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <div className="tg-stack mb-10 max-w-[720px]">
      {eyebrow ? <span className="c-eyebrow !mb-0">{eyebrow}</span> : null}
      <h1 className="tg-h2">{title}</h1>
      {lede ? <p className="tg-lede">{lede}</p> : null}
    </div>
  );
}
