import { ShieldCheck, UserPlus, Users } from "lucide-react";
import { BuildTiffinLink } from "@/components/landing/build-tiffin-link";
import type { OfferFigure, ReferralOffer } from "@/lib/referrals/offer";
import { ReferCta } from "./refer-cta";
import { ReferFlow } from "./refer-flow";
import { ReferStage } from "./refer-stage";

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

export function ReferContent({ offer }: { offer: ReferralOffer }) {
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
  return (
    <>
    {/* The hero is the offer itself: the headline and the way in on the left, the die-cut ticket that
        says what both of you get on the right, its terms right under the CTA. */}
    <section className="tg-refer-stage dark" aria-labelledby="tg-refer-title">
      <div className="tg-wrap tg-refer-stage__in tg-refer-hero2">
        <div className="tg-refer__intro">
          <span className="lp-kicker tg-refer-stage__eyebrow">Refer a friend</span>
          <h1 id="tg-refer-title" className="lp-display lp-display--page tg-refer-stage__h">{referHeadline(offer)}</h1>
          <p className="lp-lede tg-refer-stage__lede">Share your link. When your friend pays for their first plan, you both get coins to spend on tiffins.</p>
          <div><ReferCta /></div>
          <ul className="tg-refer-terms tg-refer-terms--dark">
            <li><UserPlus aria-hidden /><span><strong>New customers only</strong>Your friend has not ordered with us before.</span></li>
            {offer.maxPerReferrer ? <li><Users aria-hidden /><span><strong>Up to {offer.maxPerReferrer} friends</strong>Each one pays out once their first plan is paid.</span></li> : null}
            <li><ShieldCheck aria-hidden /><span><strong>Coins spend on tiffins</strong>They come off your next plan; they never cash out.</span></li>
          </ul>
        </div>
        {/* The phone shows where sharing happens; the ticket, stuck across its corner like a sticker,
            says what both of you get. */}
        <div className="tg-refer-hero2__art">
          <ReferStage gift={offer.friend?.big ?? null} earn={offer.referrer?.big ?? null} coins={offer.referrerCoins} />
          <div className="tg-refer-hero2__ticket">
            <ReferTicket friend={offer.friend} referrer={offer.referrer} />
          </div>
        </div>
      </div>
    </section>
    <ReferFlow offer={offer} />
    </>
  );
}
