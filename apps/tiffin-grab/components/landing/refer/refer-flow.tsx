import { ArrowRight, Coins, Gift, Link2, MapPin, PauseCircle, ShieldCheck, Tag, UserPlus, Users, Wallet } from "lucide-react";
import Image from "next/image";
// The brand tiffin cut-out (the share card uses the same file); a static import, outside the /landing image allowlist.
import tiffinImg from "@/public/refer-card/tiffin.png";
import Link from "next/link";
import { IconTile } from "@/components/customer/kit/icon-tile";
import { makeCategoryLook } from "@/components/customer/meals/category-look";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import type { ReferralOffer } from "@/lib/referrals/offer";
import { rewardOf, tagFaces } from "./friend-copy";
import { ReferCta } from "./refer-cta";
import type { ReferExtras } from "./refer-types";
import { ReferSteps, type ReferStep } from "./refer-steps";
import { ReferTag } from "./refer-tag";

/** The food a stranger is signing up for: one day of this week's published menu, then the plain facts. */
function Food({ extras }: { extras: ReferExtras }) {
  const { day, fromRate } = extras;
  const look = makeCategoryLook();
  const facts = [
    ...(fromRate ? [{ icon: Tag, text: `From ${fromRate} a tiffin` }] : []),
    { icon: PauseCircle, text: "Pause any day" },
    { icon: MapPin, text: "Delivered across the GTA" },
  ];
  return (
    <section className="lp-wrap rf3-food" aria-labelledby="rf3-food-title">
      <h2 id="rf3-food-title" className="lp-h2">{day ? (day.today ? "Today’s tiffin" : `${day.label}’s tiffin`) : "Your tiffin"}</h2>
      {day ? (
        <ol className="rf3-food__strip" tabIndex={0} aria-label={`${day.label} tiffin, tier by tier`}>
          {day.tiers.map((t) => {
            const l = look(t.row);
            return (
              <li key={t.row} className="rf3-dish">
                <IconTile tint={l.tint}><l.icon /></IconTile>
                <span className="rf3-dish__row">{t.row}{t.dishes.length > 1 ? ", pick one" : ""}</span>
                <strong>{t.dishes.slice(0, 2).join(" or ")}{t.dishes.length > 2 ? ` +${t.dishes.length - 2}` : ""}</strong>
              </li>
            );
          })}
        </ol>
      ) : null}
      <div className="rf3-food__foot">
        <ul className="rf3-facts">
          {facts.map((f) => <li key={f.text}><f.icon aria-hidden strokeWidth={2} />{f.text}</li>)}
        </ul>
        <Link href="/menu" className="lp-textlink">See this week’s menu<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link>
      </div>
    </section>
  );
}

/** Share, they order, coins land: one line each, figures from the live offer. */
function stepsOf({ friend, referrer }: ReferralOffer): ReferStep[] {
  const wallets = friend && referrer ? "both wallets" : referrer ? "your wallet" : "their wallet";
  return [
    { title: "Share your link", body: "Sign in, then send it by WhatsApp, Messages or a copied link." },
    { title: "Your friend orders", body: friend ? `They get ${rewardOf(friend)} on their first plan.` : "They build a plan and pay for it." },
    { title: `Coins land in ${wallets}`, body: referrer ? `Once their first plan is paid. Yours: ${referrer.small}.` : "Once their first plan is paid." },
  ];
}

export function ReferFlow({ offer, extras }: { offer: ReferralOffer; extras: ReferExtras }) {
  const friendGets = offer.friend ? `They get ${offer.friend.big}: ${offer.friend.small.replace("your wallet", "their wallet")}` : null;
  // The demo counts the referrer's coins up, so it needs a flat referrer reward to show.
  const demo = offer.referrer && offer.referrerCoins != null ? { gift: offer.friend?.big ?? null, earn: offer.referrer.big, coins: offer.referrerCoins } : null;
  const faqs: { q: string; a: string; icon: typeof Link2 }[] = [
    { icon: Link2, q: "Where do I find my link?", a: "Open Refer in your Tiffin Grab account. Your code and link are there, one tap to WhatsApp, Messages or a copied link." },
    ...(friendGets ? [{ icon: Gift, q: "What does my friend get?", a: `${friendGets}, on their first plan.` }] : []),
    { icon: Coins, q: "When do the coins arrive?", a: "Once your friend's first plan is paid. They turn Rewarded on your list and the coins land in both wallets." },
    { icon: UserPlus, q: "Who can I refer?", a: "Anyone who has not ordered a plan from us before. Every customer can share their link." },
    ...(offer.maxPerReferrer ? [{ icon: Users, q: "How many friends can I refer?", a: `Up to ${offer.maxPerReferrer}. Each one pays out once, when their first plan is paid.` }] : []),
    { icon: Wallet, q: "Can I cash the coins out?", a: "No. Coins come off the price of your next plan; they never turn into cash." },
  ];
  const [face] = tagFaces(offer);
  return (
    <>
      <section className="lp-wrap rf3-steps" aria-labelledby="rf3-steps-title">
        <ReferSteps steps={stepsOf(offer)} demo={demo} />
      </section>
      <Food extras={extras} />
      <section className="lp-wrap rf3-terms" aria-label="Terms and questions">
        <div className="rf-good" aria-labelledby="rf-good-title">
          <h2 id="rf-good-title" className="lp-h2">Good to know</h2>
          <ul>
            <li><UserPlus aria-hidden /><span><strong>Your friend is new to us</strong>They have not ordered a plan before.</span></li>
            {offer.maxPerReferrer ? <li><Users aria-hidden /><span><strong>Up to {offer.maxPerReferrer} friends</strong>Each one pays out once their first plan is paid.</span></li> : null}
            <li><ShieldCheck aria-hidden /><span><strong>Coins spend on tiffins</strong>They come off your next plan; they never cash out.</span></li>
            {offer.referrer ? <li><Coins aria-hidden /><span><strong>{offer.referrer.big} for you</strong>{offer.referrer.small}</span></li> : null}
          </ul>
        </div>
        <div className="rf-faq" aria-labelledby="rf-faq-title">
          <div className="rf-faq__head">
            <h2 id="rf-faq-title" className="lp-h2">Before you share</h2>
            <p className="lp-lede">The rules in plain words. Anything else, ask us.</p>
            <Link href="/contact" className="lp-textlink">Contact us<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link>
          </div>
          <FaqAccordion items={faqs} name="rf-faq" />
        </div>
      </section>
      <section className="lp-wrap rf3-close-wrap" aria-labelledby="rf3-close-title">
        <div className="rf3-close dark">
          {face ? (
            <div className="rf3-obj rf3-close__obj" aria-hidden>
              <Image src={tiffinImg} alt="" sizes="(max-width: 767px) 280px, 340px" className="rf3-obj__img" />
              <ReferTag faces={[face]} still />
            </div>
          ) : null}
          <div className="rf3-close__copy">
            <h2 id="rf3-close-title" className="lp-h2 rf3-close__h">Your link is waiting.</h2>
            <p>It lives in your account, ready to send the moment you sign in.</p>
            <div className="rf3-close__act">
              <span data-rf-cta="final"><ReferCta /></span>
              {extras.promo ? <p className="rf3-close__promo">New here? {extras.promo}.</p> : null}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
