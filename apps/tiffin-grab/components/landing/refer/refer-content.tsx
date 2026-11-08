import Image from "next/image";
// The brand tiffin cut-out (the share card uses the same file); a static import, outside the /landing image allowlist.
import tiffinImg from "@/public/refer-card/tiffin.png";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BuildTiffinLink } from "@/components/landing/build-tiffin-link";
import type { OfferFigure, ReferralOffer } from "@/lib/referrals/offer";
import { rewardOf, tagFaces } from "./friend-copy";
import { ReferCta } from "./refer-cta";
import { ReferDock } from "./refer-dock";
import { ReferFlow } from "./refer-flow";
import { ReferSticker } from "./refer-sticker";
import { ReferTag } from "./refer-tag";

/** "Give $15, get $15." with each side's own figure; one figure when only one side pays. */
export function referHeadline(offer: ReferralOffer): string {
  const { friend, referrer } = offer;
  if (friend && referrer) return `Give ${friend.big}, get ${referrer.big}.`;
  if (friend) return `Give your friends ${friend.big}.`;
  return `Get ${referrer!.big} for every friend.`;
}

/** The program as a two-part ticket: the friend's half and yours, joined at a tear line. */
// `friendLabel` set = the friend is reading (their own half, their own wallet).
export function ReferTicket({ friend, referrer, friendLabel }: { friend: OfferFigure | null; referrer: OfferFigure | null; friendLabel?: string }) {
  return (
    <div className="tg-refer__ticket" aria-hidden>
      {friend ? (
        <div className="tg-refer__half tg-refer__half--friend">
          <span className="tg-refer__who">{friendLabel ?? "Your friend"}</span>
          <strong>{friend.big}</strong>
          <small>{friendLabel ? friend.small : friend.small.replace("your wallet", "their wallet")}</small>
        </div>
      ) : null}
      {referrer ? (
        <div className="tg-refer__half tg-refer__half--you">
          <span className="tg-refer__who">You</span>
          <strong>{referrer.big}</strong>
          <small>{referrer.small}</small>
        </div>
      ) : null}
    </div>
  );
}

/** The second sentence of the hero: both sides when they match, each side's own figure when they differ. */
function rewardLine({ friend, referrer }: ReferralOffer) {
  if (friend && referrer && friend.big === referrer.big) return <>You both get <span className="c-accent">{rewardOf(friend)}</span>.</>;
  if (friend && referrer) return <>Your friend gets <span className="c-accent">{rewardOf(friend)}</span>. You get {rewardOf(referrer)}.</>;
  if (friend) return <>Your friend gets <span className="c-accent">{rewardOf(friend)}</span>.</>;
  return <>You get <span className="c-accent">{rewardOf(referrer!)}</span> per friend.</>;
}

const TIFFIN_ALT = "An illustrated tiffin carrier with green tiers and a marigold lid, on a kitchen board beside a stove and a calendar";

export type ReferExtras = {
  /** Lowest live per-tiffin rate, formatted ("$9.99"); null when no plan is orderable. */
  fromRate: string | null;
  /** One day of the published week, tier by tier; null when no week is published. */
  day: { label: string; today: boolean; tiers: { row: string; dishes: string[] }[] } | null;
  /** "10% off with WELCOME10" from the running promotion; null when none runs. */
  promo: string | null;
};

const NO_EXTRAS: ReferExtras = { fromRate: null, day: null, promo: null };

export function ReferContent({ offer, extras = NO_EXTRAS }: { offer: ReferralOffer; extras?: ReferExtras }) {
  if (!offer.on) {
    return (
      <section className="lp-wrap lp-section tg-refer">
        <div className="tg-refer__intro">
          <h1 className="lp-display lp-display--page">Referrals are <span className="c-accent">paused.</span></h1>
          <p className="lp-lede">Check back soon. Your tiffin is still one tap away.</p>
          <div><BuildTiffinLink className="lp-cta">Build my tiffin</BuildTiffinLink></div>
        </div>
      </section>
    );
  }
  const from = extras.fromRate ? ` from ${extras.fromRate}` : "";
  return (
    <div className="rf3">
      {/* tg-refer-stage: core.css tucks it under the header and turns the header's glass dark over it. */}
      <section id="rf-hero" className="tg-refer-stage rf3-hero dark" aria-labelledby="rf-hero-title">
        <div className="lp-wrap rf3-hero__in">
          <div className="rf3-hero__copy">
            <h1 id="rf-hero-title" className="lp-display lp-display--page rf3-hero__h">
              <span>Share your tiffin.</span> <span>{rewardLine(offer)}</span>
            </h1>
            <p className="rf3-hero__sub">Home style thalis{from} across the GTA, with coins when your friend pays.</p>
          </div>
          <div className="rf3-obj rf3-hero__obj">
            <Image src={tiffinImg} alt={TIFFIN_ALT} preload sizes="(max-width: 959px) calc(100vw - 32px), 560px" className="rf3-obj__img" />
            <ReferSticker friend={offer.friend} referrer={offer.referrer} />
            <ReferTag faces={tagFaces(offer)} />
          </div>
          <div className="rf3-hero__act">
            <div className="lp-actions lp-actions--start">
              <span data-rf-cta="hero"><ReferCta /></span>
              <Link href="/menu" className="lp-textlink">See this week’s menu<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link>
            </div>
            <p className="rf3-hero__note">Every customer gets a link. Takes a minute.</p>
          </div>
        </div>
      </section>
      <ReferFlow offer={offer} extras={extras} />
      <ReferDock offer={referHeadline(offer).replace(/\.$/, "")} />
    </div>
  );
}
