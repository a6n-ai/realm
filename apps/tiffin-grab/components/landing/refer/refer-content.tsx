import { BuildTiffinLink } from "@/components/landing/build-tiffin-link";
import type { OfferFigure, ReferralOffer } from "@/lib/referrals/offer";
import { ReferCta } from "./refer-cta";
import "./refer.css";

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

const STEPS = [
  ["Share your link", "Send it on WhatsApp or anywhere. It carries your code."],
  ["Your friend orders", "They build a plan and pay for it, like any new customer."],
  ["You both get coins", "Coins land in both wallets once that first plan is paid."],
] as const;

export function ReferContent({ offer }: { offer: ReferralOffer }) {
  if (!offer.on) {
    return (
      <section className="tg-wrap tg-section tg-refer">
        <div className="tg-refer__intro">
          <h1 className="tg-h2">Referrals are paused right now.</h1>
          <p className="tg-lede">Check back soon. Your tiffin is still one tap away.</p>
          <div><BuildTiffinLink className="tg-cta">Build my tiffin</BuildTiffinLink></div>
        </div>
      </section>
    );
  }
  return (
    <section className="tg-wrap tg-section tg-refer" aria-labelledby="tg-refer-title">
      <div className="tg-refer__hero">
      <div className="tg-refer__intro">
        <span className="c-eyebrow !mb-0">Refer a friend</span>
        <h1 id="tg-refer-title" className="tg-h2">{referHeadline(offer)}</h1>
        <p className="tg-lede">Share your link. When your friend pays for their first plan, you both get coins to spend on tiffins.</p>
        <div><ReferCta /></div>
      </div>
      <ReferTicket friend={offer.friend} referrer={offer.referrer} />
      </div>
      <ol className="tg-refer__steps">
        {STEPS.map(([title, body], i) => (
          <li key={title}>
            <span className="tg-refer__n" aria-hidden>{i + 1}</span>
            <strong>{title}</strong>
            <p>{body}</p>
          </li>
        ))}
      </ol>
      <p className="tg-refer__fine">
        New customers only.{offer.maxPerReferrer ? ` Up to ${offer.maxPerReferrer} friends each.` : ""} Coins are spent on your orders and can't be cashed out.
      </p>
    </section>
  );
}
