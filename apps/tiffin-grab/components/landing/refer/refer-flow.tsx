import { Check, ChevronLeft, Coins, Copy, Download, Link2, Mail, MessageSquare, Send, ShieldCheck, Ticket, UserPlus, Users } from "lucide-react";
import { WhatsAppGlyph } from "@/components/landing/whats-app-chat";
import type { ReferralOffer } from "@/lib/referrals/offer";
import { ReferCta } from "./refer-cta";
import "./refer-flow.css";

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
  return (
    <section className="rf tg-section" aria-labelledby="rf-title">
      <div className="tg-wrap">
        <div className="rf-head">
          <h2 id="rf-title" className="tg-h2">Three screens, <span className="c-accent">two</span> wallets.</h2>
          <p className="tg-lede">This is the whole thing, exactly as it looks in your TiffinGrab account.</p>
        </div>
        <ol className="rf-track">
          {steps.map((s, i) => (
            <li key={s.title} className={`rf-step-col rf-step-col--${i + 1}`}>
              <div className="rf-frame" aria-hidden>{s.screen}</div>
              <div className="rf-caption">
                <strong>{s.title}</strong>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="rf-foot">
          <ul className="rf-facts">
            <li><UserPlus aria-hidden />New customers only</li>
            {offer.maxPerReferrer ? <li><Users aria-hidden />Up to {offer.maxPerReferrer} friends each</li> : null}
            <li><ShieldCheck aria-hidden />Coins spend on tiffins, never cashed out</li>
          </ul>
          <ReferCta />
        </div>
      </div>
    </section>
  );
}
