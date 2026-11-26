import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LandingPromo } from "@/lib/landing/promo-types";

// The site's four-point mark (lp-story__mark), at ticker size.
export function Spark({ className }: { className?: string }) {
  return (
    <svg className={className} width="10" height="10" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0Z" />
    </svg>
  );
}

/** What the ticker says: each discount the biggest receipt stacks, then the real end date. */
export function saleItems(promo: LandingPromo): string[] {
  const lines = promo.savings?.perks ?? [];
  const items = lines.flatMap((l) => (l.figure && l.perk ? [`${l.figure} ${l.perk}`] : []));
  if (items.length === 0 && promo.blurb) items.push(promo.blurb);
  if (promo.endsLabel) items.push(promo.endsLabel);
  return items;
}

// One tap target: the href already carries the coupon (?c=), which checkout re-validates.
// The ticker is two identical runs sliding by half its width; the second run is decoration.
export function PromoBar({ promo }: { promo: LandingPromo }) {
  const items = saleItems(promo);
  const lead = promo.upToPct ? `Up to ${promo.upToPct} off` : (promo.savings?.headline ?? promo.badge);
  const run = (copy: boolean) => (
    <span className="tg-sale__run" aria-hidden={copy || undefined}>
      {items.map((t) => (
        <span key={t} className="tg-sale__item"><Spark className="tg-sale__spark" />{t}</span>
      ))}
    </span>
  );
  return (
    <Link href={promo.href} prefetch={false} className="tg-sale">
      <span className="tg-sale__mark">{promo.title}</span>
      {lead ? <span className="tg-sale__lead">{lead}</span> : null}
      <span className="tg-sale__ticker">
        <span className="tg-sale__track">{run(false)}{run(true)}</span>
      </span>
      <span className="tg-sale__cta">
        <span className="tg-sale__cta-text">{promo.cta}</span>
        <ArrowRight aria-hidden className="size-4" strokeWidth={2.2} />
      </span>
    </Link>
  );
}
