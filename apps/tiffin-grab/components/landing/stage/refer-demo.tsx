"use client";

import { ArrowLeft, Check, ChevronLeft, Phone as PhoneIcon, Video, Wallet } from "lucide-react";
import { Phone, Stage, type Act } from "./kit";
import "./refer-demo.css";

// A referral, start to payoff, on one phone. Three screens slide as one track:
//   1. WhatsApp: a friend's message with the share card. Tap the card.
//   2. TiffinGrab: "Priya gave you $15. Let's build your tiffin." Tap Build my tiffin.
//   3. Paid: the order confirms and the coins drop into the wallet, counting up.
// The reset has a cause on screen: the back arrow returns to the chat.

type Screen = 0 | 1 | 2;
type S = { screen: Screen; typing: boolean; sent: boolean; coins: number; landed: boolean };

const START: S = { screen: 0, typing: true, sent: false, coins: 0, landed: false };
const REST = { x: 230, y: 600 };

const script = (total: number) => async (a: Act<S>) => {
  await a.wait(900);
  a.put({ typing: false, sent: true });
  await a.wait(1600);
  a.mark("open");
  await a.click("card");
  a.put({ screen: 1 });
  await a.wait(2300);
  a.mark("build");
  await a.click("build");
  a.put({ screen: 2 });
  await a.wait(500);
  a.put({ landed: true });
  for (let i = 1; i <= 12; i++) {
    a.put({ coins: Math.round((total * i) / 12) });
    await a.wait(45);
  }
  await a.wait(2600);
  a.mark("back");
  await a.click("back");
  a.put({ screen: 0, typing: true, sent: false, coins: 0, landed: false });
  await a.move(REST);
  await a.wait(300);
};

/** `gift` is the friend's figure ("$15"), `coins` the coins it pays (60). */
export function ReferDemo({ gift, coins, className }: { gift: string; coins: number; className?: string }) {
  const POSTER: S = { screen: 1, typing: false, sent: true, coins, landed: true };
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
            {/* 1. The chat */}
            <section className="rd-screen rd-chat" aria-hidden={s.screen !== 0}>
              <header className="rd-wa__bar">
                <ChevronLeft size={22} />
                <span className="rd-wa__av">P</span>
                <span className="rd-wa__who"><b>Priya</b><small>{s.typing ? "typing…" : "online"}</small></span>
                <Video size={20} />
                <PhoneIcon size={18} />
              </header>
              <div className="rd-wa__wall">
                <p className="rd-wa__in">Have you tried TiffinGrab? Dal like my mom's 😋</p>
                <div className="rd-wa__in rd-wa__card" data-on={s.sent || undefined} data-target="card">
                  <div className="rd-card">
                    <span className="rd-card__k">Priya gave you</span>
                    <strong>{gift}</strong>
                    <span className="rd-card__m">for your first tiffin plan</span>
                    <span className="rd-card__code">K7M2QX</span>
                  </div>
                  <span className="rd-wa__link">tiffingrab.ca/r/K7M2QX</span>
                </div>
                {s.typing ? <span className="rd-wa__dots"><i /><i /><i /></span> : null}
              </div>
            </section>

            {/* 2. The friend page */}
            <section className="rd-screen rd-invite" aria-hidden={s.screen !== 1}>
              <span className="rd-invite__eyebrow">You're invited</span>
              <h3 className="rd-invite__h">Priya gave you <em>{gift}.</em></h3>
              <p className="rd-invite__sub">Let's build your tiffin.</p>
              <div className="rd-ticket">
                <span>From Priya</span>
                <strong>{gift}</strong>
                <small>{coins} coins in your wallet</small>
              </div>
              <p className="rd-invite__label">Your first plan</p>
              <div className="rd-opts">
                <span className="rd-opt" data-on>Veg</span>
                <span className="rd-opt">Non-veg</span>
                <span className="rd-opt">Healthy</span>
              </div>
              <div className="rd-rows">
                <span className="rd-row"><b>4 Item Thali</b><i>Sabzi · Daal · Rice · Roti</i></span>
                <span className="rd-row"><b>Mon to Fri</b><i>4 weeks</i></span>
              </div>
              <span className="rd-invite__cta" data-target="build">Build my tiffin</span>
            </section>

            {/* 3. Paid: coins land */}
            <section className="rd-screen rd-paid" aria-hidden={s.screen !== 2}>
              <span className="rd-paid__back" data-target="back"><ArrowLeft size={20} /></span>
              <span className="rd-paid__ok"><Check size={28} strokeWidth={3} /></span>
              <h3 className="rd-paid__h">Your plan is booked.</h3>
              <p className="rd-paid__sub">4 Item Thali · 4 weeks · Mon to Fri</p>
              <div className="rd-wallet" data-landed={s.landed || undefined}>
                <span className="rd-wallet__ic"><Wallet size={20} /></span>
                <span className="rd-wallet__t">Wallet</span>
                <b className="rd-wallet__n">{s.coins}<small> coins</small></b>
              </div>
              <span className="rd-coin" data-landed={s.landed || undefined} aria-hidden>+{coins}</span>
              <p className="rd-paid__note">A thank-you just went to Priya too.</p>
            </section>
          </div>
        </Phone>
      )}
    </Stage>
  );
}
