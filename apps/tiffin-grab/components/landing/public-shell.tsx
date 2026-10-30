import Link from "next/link";
import { ViewTransition, type ReactNode } from "react";
import { LandingHeader } from "@/components/landing/landing-header";
import { reviewsConnected } from "@/components/landing/landing-reviews";
import { WhatsAppChat } from "@/components/landing/whatsapp-chat";
import { LocationPicker } from "@/components/marketing/location-picker";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import "@/components/landing/landing.css";

// One shell for every public page: the landing header, the ink close band and
// the location picker. .customer-app opts in to the customer design system.
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="tg-land customer-app">
      <LandingHeader />
      {/* Route changes cross-fade the page under a header that stays put (see landing.css). */}
      <main id="main"><ViewTransition default="tg-page">{children}</ViewTransition></main>
      <PublicFooter />
      <LocationPicker />
      <WhatsAppChat />
    </div>
  );
}

async function PublicFooter() {
  const [catalog, showReviews] = await Promise.all([loadCatalogSnapshot().catch(() => null), reviewsConnected()]);
  const zones = catalog?.zones.filter((z) => z.active).map((z) => z.name) ?? [];
  return (
    <footer className="tg-close">
      <div className="tg-wrap">
        <h2 className="tg-h2 max-w-[14ch]">Your first tiffin, your <span className="c-accent">way.</span></h2>
        <div className="mt-8"><Link prefetch={false} href="/subscribe" className="tg-cta">Build my tiffin</Link></div>
        {zones.length > 0 ? <p className="mt-8 max-w-[70ch] text-sm opacity-75">Delivering to {zones.join(", ")}.</p> : null}
        <div className="tg-foot">
          <nav aria-label="Site">
            <Link href="/menu/weekly">Menu</Link>
            <Link href="/plans">Plans</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/locations">Locations</Link>
            {showReviews ? <Link href="/reviews">Reviews</Link> : null}
            <Link href="/faq">FAQ</Link>
            <Link href="/contact">Contact</Link>
          </nav>
          <nav aria-label="Legal">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/refund-policy">Refunds</Link>
            <Link href="/delivery-policy">Delivery</Link>
            <span className="opacity-60">© {new Date().getFullYear()} Tiffin Grab</span>
          </nav>
        </div>
      </div>
      <div className="tg-close__mark" aria-hidden>TIFFIN GRAB</div>
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
