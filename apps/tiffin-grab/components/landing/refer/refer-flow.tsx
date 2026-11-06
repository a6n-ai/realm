import { Check, ChevronLeft, Coins, Copy, Download, Gift, Link2, Mail, MessageSquare, Send, Ticket, UserPlus, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { SwipeRow } from "@/components/landing/home/swipe-row";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { ArrowRight } from "lucide-react";
import { WhatsAppGlyph } from "@/components/landing/whats-app-chat";
import type { ReferralOffer } from "@/lib/referrals/offer";
import { ReferCta } from "./refer-cta";

// Illustrative only: the screens show a made-up customer, never a real code or person.
const DEMO_CODE = "PRIYA5";
const DEMO_NAME = "Priya";

/** The share card from Me > Refer, cut down to what the story needs. */
function ShareScreen() {
  return (
    <div className="rf-screen rf-screen--app">
      <div className="rf-bar"><ChevronLeft aria-hidden /><span>Refer</span></div>
      <div className="rf-card">
        <div className="rf-card__head">
          <span className="rf-tile rf-tile--purple"><Ticket aria-hidden /></span>
          <div><strong>Your referral code</strong><small>Share it with friends</small></div>
        </div>
        <div className="rf-code">
          <span>{DEMO_CODE}</span>
          <em><Copy aria-hidden /> Copy code</em>
        </div>
        <span className="rf-wa"><WhatsAppGlyph className="size-4" /> Share on WhatsApp</span>
        <div className="rf-targets">
          {[
            [Download, "blue"],
            [MessageSquare, "green"],
            [Mail, "orange"],
            [Send, "cyan"],
            [Link2, "gray"],
          ].map(([Icon, tint], i) => {
            const I = Icon as typeof Download;
            return <span key={i} className={`rf-tile rf-tile--${tint}`}><I aria-hidden /></span>;
          })}
        </div>
      </div>
    </div>
  );
}

/** The friend's WhatsApp: your message arrives with the card preview of your link. */
function ChatScreen({ gift }: { gift: string | null }) {
  return (
    <div className="rf-screen rf-screen--chat">
      <div className="rf-bar rf-bar--wa"><ChevronLeft aria-hidden /><span className="rf-ava">{DEMO_NAME[0]}</span><span>{DEMO_NAME}</span></div>
      <div className="rf-chat">
        <div className="rf-bubble">
          <div className="rf-preview">
            <div className="rf-preview__art">
              <b>Tiffin<i>Grab</i></b>
              <strong>{gift ? `${DEMO_NAME} gave you ${gift}` : `${DEMO_NAME} invited you`}</strong>
              <span className="rf-preview__code">{DEMO_CODE}</span>
            </div>
            <small>tiffingrab.ca/r/{DEMO_CODE}</small>
          </div>
          <p>Try my tiffin place, home-style dal like mom&apos;s.</p>
          <time>7:42 <Check aria-hidden /><Check aria-hidden /></time>
        </div>
        <div className="rf-bubble rf-bubble--in">Ordering tonight 🙌<time>7:45</time></div>
      </div>
    </div>
  );
}

/** Your friends list from Me > Refer: the first row walks Joined → Ordered → Rewarded as the page scrolls. */
function FriendsScreen({ earn }: { earn: string }) {
  return (
    <div className="rf-screen rf-screen--app">
      <div className="rf-bar"><ChevronLeft aria-hidden /><span>Refer</span></div>
      <div className="rf-card rf-stat">
        <span className="rf-tile rf-tile--brown"><Coins aria-hidden /></span>
        <div>
          <small>From referrals</small>
          <span className="rf-stat__value">
            <span className="rf-step rf-step--before">0 coins</span>
            <span className="rf-step rf-step--after">+{earn}</span>
          </span>
        </div>
      </div>
      <p className="rf-label">Your friends</p>
      <ul className="rf-list">
        <li className="rf-row--live">
          <span className="rf-ava rf-ava--a">A</span>
          <span className="rf-row__name">Aman<small>Joined today</small></span>
          <span className="rf-pills">
            <span className="rf-pill rf-pill--up rf-step rf-step--1">Joined</span>
            <span className="rf-pill rf-pill--brand rf-step rf-step--2">Ordered</span>
            <span className="rf-pill rf-pill--ok rf-step rf-step--3">Rewarded</span>
          </span>
        </li>
        <li>
          <span className="rf-ava rf-ava--n">N</span>
          <span className="rf-row__name">Neha<small>Joined Oct 28</small></span>
          <span className="rf-pill rf-pill--ok">Rewarded</span>
        </li>
        <li>
          <span className="rf-ava rf-ava--r">R</span>
          <span className="rf-row__name">Ravi<small>Joined Oct 12</small></span>
          <span className="rf-pill rf-pill--ok">Rewarded</span>
        </li>
      </ul>
    </div>
  );
}

/** How it works, told with the app's own screens in the order a customer meets them. */
export function ReferFlow({ offer }: { offer: ReferralOffer }) {
  const gift = offer.friend?.big ?? null;
  const earn = offer.referrer?.big ?? "coins";
  const steps = [
    {
      screen: <ShareScreen />,
      title: "Share from your app",
      body: "Open Refer in your account. Your code is waiting, one tap to WhatsApp, Messages or a copied link.",
    },
    {
      screen: <ChatScreen gift={gift} />,
      title: "Your friend taps the link",
      body: gift
        ? `They land on a page with your name and their ${gift}, then build a plan like any new customer.`
        : "They land on a page with your name, then build a plan like any new customer.",
    },
    {
      screen: <FriendsScreen earn={earn} />,
      title: "Coins in both wallets",
      body: `Once their first plan is paid, they turn Rewarded on your list${offer.referrer ? ` and ${offer.referrer.small}` : ""}.`,
    },
  ];
  const friendGets = offer.friend ? `They get ${offer.friend.big}: ${offer.friend.small.replace("your wallet", "their wallet")}` : null;
  // Only what this page already promises: the terms beside the ticket and the three steps.
  const faqs: { q: string; a: string; icon: typeof Link2 }[] = [
    { icon: Link2, q: "Where do I find my link?", a: "Open Refer in your Tiffin Grab account. Your code and link are there, one tap to WhatsApp, Messages or a copied link." },
    ...(friendGets ? [{ icon: Gift, q: "What does my friend get?", a: `${friendGets}, on their first plan.` }] : []),
    { icon: Coins, q: "When do the coins arrive?", a: "Once your friend's first plan is paid. They turn Rewarded on your list and the coins land in both wallets." },
    { icon: UserPlus, q: "Who counts as a new customer?", a: "Someone who has not ordered a plan from us before." },
    ...(offer.maxPerReferrer ? [{ icon: Users, q: "How many friends can I refer?", a: `Up to ${offer.maxPerReferrer}. Each one pays out once, when their first plan is paid.` }] : []),
    { icon: Wallet, q: "Can I cash the coins out?", a: "No. Coins come off the price of your next plan; they never turn into cash." },
  ];
  return (
    <section className="rf tg-section" aria-labelledby="rf-title">
      <div className="lp-wrap">
        <div className="lp-head">
          <h2 id="rf-title" className="lp-h2">Three screens, <span className="c-accent">two</span> wallets.</h2>
          <p className="lp-lede lp-lede--center">This is the whole thing, exactly as it looks in your TiffinGrab account.</p>
        </div>
        {/* One full-colour tile per step, equal height: number, title and line on top, the real screen
            bleeding off the tile's foot. A real sequence, so the numbers carry information. */}
        <SwipeRow className="rf-bento" label="How referring works" names={steps.map((st) => st.title)}>
          {steps.map((s, i) => (
            <div key={s.title} className={`rf-stepcard rf-stepcard--${i + 1}`}>
              <div className="rf-stepcard__copy">
                <span className="rf-num" aria-hidden>{i + 1}</span>
                <strong>{s.title}</strong>
                <p>{s.body}</p>
              </div>
              <div className="rf-frame rf-stepcard__screen" aria-hidden>{s.screen}</div>
            </div>
          ))}
        </SwipeRow>

        <div className="rf-faq" aria-labelledby="rf-faq-title">
          <div className="rf-faq__head">
            <h2 id="rf-faq-title" className="lp-h2 lp-h2--sm">Before you <span className="c-accent">share.</span></h2>
            <p className="lp-lede">The rules in plain words. Anything else, ask us.</p>
            <Link href="/contact" className="lp-textlink">Contact us<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link>
          </div>
          <FaqAccordion items={faqs} name="rf-faq" />
        </div>

        <div className="rf-close">
          <div>
            <h2 className="rf-close__h">Your link is waiting.</h2>
            <p>It lives in your account, ready to send the moment you sign in.</p>
          </div>
          <ReferCta />
        </div>
      </div>
    </section>
  );
}
