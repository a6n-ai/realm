import Link from "next/link";

/** Thin site-wide promo strip for the public marketing shell only (not /me). */
export function AnnouncementBar() {
  return (
    <div className="tg-announce" role="region" aria-label="New customer offer">
      <p className="tg-announce__text">
        <span className="tg-announce__label">New customer offer</span>
        <span className="tg-announce__sep" aria-hidden>
          —
        </span>
        <span>Save over $65 on your first TiffinGrab plan</span>
      </p>
      <Link prefetch={false} href="/subscribe" className="tg-announce__cta">
        Claim offer
      </Link>
    </div>
  );
}
