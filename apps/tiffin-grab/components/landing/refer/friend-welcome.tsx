import Link from "next/link";
import type { OfferFigure } from "@/lib/referrals/offer";
import type { PromoSavings } from "@/lib/landing/promo-types";
import { friendHeadline } from "./friend-copy";
import { ReferTicket } from "./refer-content";
import "./refer.css";

const STEPS = [
  ["Build your plan", "Pick your diet, meal size, days and weeks."],
  ["Pay for it", "Your code rides along to checkout on its own."],
  ["Coins land in your wallet", "Spend them on your next tiffins."],
] as const;

/** The page a friend lands on from a referral link: greeted by name, then straight into ordering
 *  with the code carried on ?ref= (the proxy sets the referral cookie there). */
export function FriendWelcome({ code, firstName, friend, promo }: {
  code: string;
  firstName: string | null;
  friend: OfferFigure;
  promo: { code: string; savings: PromoSavings } | null;
}) {
  const subscribe = `/subscribe?ref=${encodeURIComponent(code)}`;
  return (
    <section className="tg-wrap tg-section tg-refer" aria-labelledby="tg-friend-title">
      <div className="tg-refer__hero">
        <div className="tg-refer__intro">
          <span className="c-eyebrow !mb-0">You're invited</span>
          <h1 id="tg-friend-title" className="tg-h2">
            {friendHeadline(firstName, friend)} <span className="c-accent">Let's build your tiffin.</span>
          </h1>
          <p className="tg-lede">
            {friend.big} in coins, added to your wallet after your first paid order.
            {promo ? ` Plus ${promo.savings.headline.toLowerCase()} ${promo.savings.condition} with ${promo.code}.` : ""}
          </p>
          <div><Link prefetch={false} href={subscribe} className="tg-cta tg-refer__cta">Build my tiffin</Link></div>
        </div>
        <ReferTicket friend={friend} referrer={null} friendLabel={firstName ? `From ${firstName}` : "From your friend"} />
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
      <p className="tg-refer__fine">For new customers. Coins are spent on your orders and can't be cashed out.</p>
    </section>
  );
}
