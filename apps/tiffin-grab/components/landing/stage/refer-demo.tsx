"use client";

import { CalendarDays, Check, ChevronLeft, Coins, Copy, Download, Ellipsis, Gift, LifeBuoy, Link2, Mail, MessageSquare, Phone as PhoneIcon, Send, Share, Share2, Ticket, User, Users, UtensilsCrossed, Video, Wallet } from "lucide-react";
import { WhatsAppGlyph } from "@/components/landing/whats-app-chat";
import { Phone, Stage, type Act } from "./kit";
import "./refer-demo.css";

// A referral told from the referrer's own app, the same three screens as the section below:
//   1. Me > Refer: the offer and the share card. Tap Share on WhatsApp.
//   2. WhatsApp with Aman: the link goes out with its card, gets read, Aman replies. Tap back.
//   3. Me > Refer, Your friends: Aman walks Joined → Ordered → Rewarded and the coins count in.
// The reset has a cause on screen: Share again, under the list, opens the share card.
// Priya, Aman and the code are illustrative; the figures are the live offer.

type Screen = 0 | 1 | 2;
type Status = "joined" | "ordered" | "rewarded";
type S = { screen: Screen; sent: boolean; read: boolean; typing: boolean; reply: boolean; status: Status; coins: number };

const START: S = { screen: 0, sent: false, read: false, typing: false, reply: false, status: "joined", coins: 0 };
const REST = { x: 230, y: 600 };
const CODE = "PRIYA5";
const PILL: Record<Status, string> = { joined: "Joined", ordered: "Ordered", rewarded: "Rewarded" };

const script = (total: number) => async (a: Act<S>) => {
  await a.wait(1100);
  a.mark("share");
  await a.click("share");
  a.put({ screen: 1 });
  await a.wait(650);
  a.put({ sent: true });
  await a.wait(900);
  a.put({ read: true });
  await a.wait(350);
  a.put({ typing: true });
  await a.wait(1300);
  a.put({ typing: false, reply: true });
  await a.wait(1400);
  a.mark("back");
  await a.click("back");
  a.put({ screen: 2 });
  await a.wait(1000);
  a.put({ status: "ordered" });
  await a.wait(1100);
  a.put({ status: "rewarded" });
  for (let i = 1; i <= 14; i++) {
    a.put({ coins: Math.round((total * i) / 14) });
    await a.wait(40);
  }
  await a.wait(2600);
  a.mark("again");
  await a.click("again");
  a.put(START);
  await a.move(REST);
  await a.wait(300);
};

/** The customer app's floating glass tab bar, Refer lit. */
function TabBar() {
  return (
    <nav className="rd-tabs">
      <span><CalendarDays size={20} />Deliveries</span>
      <span><LifeBuoy size={20} />Support</span>
      <span data-on><Gift size={20} />Refer</span>
      <span><User size={20} />Account</span>
      <span><Ellipsis size={20} />More</span>
    </nav>
  );
}

/** `gift` is the friend's figure ("$15"), `earn` yours, `coins` the coins yours pays (60). */
export function ReferDemo({ gift, earn, coins, className }: { gift: string | null; earn: string; coins: number; className?: string }) {
  const POSTER: S = { screen: 2, sent: true, read: true, typing: false, reply: true, status: "rewarded", coins };
  return (
    <Stage<S>
      width={340}
      height={715}
      compact={{ below: 340, width: 300, height: 631 }}
      initial={START}
      poster={POSTER}
      script={script(coins)}
      cursor={{ at: REST, style: "touch", ripple: true }}
      tokens={{ "--ss-font": "var(--font-poppins), Poppins, system-ui, sans-serif", "--ss-accent": "#F06B1A" }}
      className={`rd${className ? ` ${className}` : ""}`}
    >
      {(s, _rect, layout) => (
        <Phone width={layout === "compact" ? 300 : 340} wallpaper="#FBF4E7" className="rd-phone">
          <div className="rd-track" style={{ transform: `translateX(${-100 * s.screen}%)` }}>
            {/* 1. Me > Refer */}
            <section className="rd-screen rd-app" aria-hidden={s.screen !== 0}>
              <header className="rd-app__bar"><span>Refer</span></header>
              <div className="rd-tiles">
                <div className="rd-tile">
                  <span className="rd-ic rd-ic--orange"><Gift size={16} /></span>
                  <small>You get</small>
                  <b>{earn}</b>
                </div>
                {gift ? (
                  <div className="rd-tile">
                    <span className="rd-ic rd-ic--pink"><Users size={16} /></span>
                    <small>Your friend gets</small>
                    <b>{gift}</b>
                  </div>
                ) : null}
              </div>
              <div className="rd-card">
                <div className="rd-card__head">
                  <span className="rd-ic rd-ic--purple"><Ticket size={16} /></span>
                  <span><b>Your referral code</b><small>Share it with friends</small></span>
                </div>
                <div className="rd-code"><span>{CODE}</span><em><Copy size={11} /> Copy code</em></div>
                <span className="rd-wa-btn" data-target="share"><WhatsAppGlyph className="size-4" /> Share on WhatsApp</span>
                <div className="rd-targets">
                  <span className="rd-ic rd-ic--blue"><Download size={16} /></span>
                  <span className="rd-ic rd-ic--green"><MessageSquare size={16} /></span>
                  <span className="rd-ic rd-ic--orange"><Mail size={16} /></span>
                  <span className="rd-ic rd-ic--cyan"><Send size={16} /></span>
                  <span className="rd-ic rd-ic--gray"><Link2 size={16} /></span>
                </div>
              </div>
              <p className="rd-label">How it works</p>
              <ol className="rd-steps">
                <li><span className="rd-ic rd-ic--blue"><Share2 size={16} /></span><span><b>Share your code</b><small>Send your link to a friend</small></span></li>
                <li><span className="rd-ic rd-ic--cyan"><UtensilsCrossed size={16} /></span><span><b>They order</b><small>And pay for their first plan</small></span></li>
                <li><span className="rd-ic rd-ic--green"><Coins size={16} /></span><span><b>You both get coins</b><small>In both wallets</small></span></li>
              </ol>
              <TabBar />
            </section>

            {/* 2. WhatsApp with Aman */}
            <section className="rd-screen rd-chat" aria-hidden={s.screen !== 1}>
              <header className="rd-wa__bar">
                <span data-target="back" className="rd-wa__back"><ChevronLeft size={22} /></span>
                <span className="rd-wa__av">A</span>
                <span className="rd-wa__who"><b>Aman</b><small>{s.typing ? "typing…" : "online"}</small></span>
                <Video size={20} />
                <PhoneIcon size={18} />
              </header>
              <div className="rd-wa__wall">
                <span className="rd-wa__day">Yesterday</span>
                <p className="rd-wa__in">New job is great but I&apos;m living on instant noodles 😅</p>
                <p className="rd-wa__mine">Haha same before I found a tiffin place</p>
                <span className="rd-wa__day">Today</span>
                <p className="rd-wa__in">Any good tiffin near you? So tired of cooking every night.</p>
                <div className="rd-wa__out" data-on={s.sent || undefined}>
                  <div className="rd-prev">
                    <b className="rd-prev__brand">Tiffin<i>Grab</i></b>
                    <strong>{gift ? `Priya gave you ${gift}` : "Priya invited you"}</strong>
                    <span className="rd-prev__code">{CODE}</span>
                  </div>
                  <span className="rd-wa__link">tiffingrab.ca/r/{CODE}</span>
                  <p>Try mine, home-style dal like mom&apos;s.</p>
                  <time data-read={s.read || undefined}>7:42 <Check size={12} /><Check size={12} /></time>
                </div>
                {s.typing ? <span className="rd-wa__dots"><i /><i /><i /></span> : null}
                {s.reply ? <p className="rd-wa__in rd-wa__reply">Ordering tonight 🙌</p> : null}
              </div>
            </section>

            {/* 3. Me > Refer, Your friends */}
            <section className="rd-screen rd-app" aria-hidden={s.screen !== 2}>
              <header className="rd-app__bar">
                <span>Refer</span>
              </header>
              <div className="rd-card rd-stat" data-landed={s.status === "rewarded" || undefined}>
                <span className="rd-ic rd-ic--brown"><Coins size={16} /></span>
                <span><small>From referrals</small><b>{s.coins}<em> coins</em></b></span>
                <span className="rd-stat__plus" aria-hidden>+{earn}</span>
              </div>
              <div className="rd-card rd-wallet">
                <span className="rd-ic rd-ic--indigo"><Wallet size={16} /></span>
                <span><small>In your wallet</small><b>{120 + s.coins}<em> coins</em></b></span>
              </div>
              <p className="rd-label">Your friends</p>
              <ul className="rd-list">
                <li className="rd-list__live">
                  <span className="rd-av rd-av--a">A</span>
                  <span className="rd-list__name">Aman<small>Joined today</small></span>
                  <span key={s.status} className={`rd-pill rd-pill--${s.status}`}>{PILL[s.status]}</span>
                </li>
                <li>
                  <span className="rd-av rd-av--n">N</span>
                  <span className="rd-list__name">Neha<small>Joined Oct 28</small></span>
                  <span className="rd-pill rd-pill--rewarded">Rewarded</span>
                </li>
                <li>
                  <span className="rd-av rd-av--r">R</span>
                  <span className="rd-list__name">Ravi<small>Joined Oct 12</small></span>
                  <span className="rd-pill rd-pill--rewarded">Rewarded</span>
                </li>
                <li>
                  <span className="rd-av rd-av--s">S</span>
                  <span className="rd-list__name">Sana<small>Joined Sep 30</small></span>
                  <span className="rd-pill rd-pill--rewarded">Rewarded</span>
                </li>
              </ul>
              <div className="rd-card rd-again">
                <span className="rd-ic rd-ic--purple"><Ticket size={16} /></span>
                <span><b>{CODE}</b><small>Invite more friends</small></span>
                <span className="rd-again__btn" data-target="again"><Share size={14} /> Share again</span>
              </div>
              <TabBar />
            </section>
          </div>
        </Phone>
      )}
    </Stage>
  );
}
