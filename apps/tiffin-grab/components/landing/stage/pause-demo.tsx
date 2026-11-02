"use client";

import { CalendarCheck, ChevronLeft, ChevronRight, Clock, Ellipsis, Gift, House, Info, LifeBuoy, Truck, User, UtensilsCrossed, Wallet } from "lucide-react";
import { Phone, Stage, type Act } from "./kit";
import "./pause-demo.css";

// The customer Deliveries screen (/me), light theme: tap Wed in the week,
// tap Pause (one tap, no sheet), a toast confirms and the dot turns orange.
// Reset has a seen cause: Resume, then Tue is tapped again.

type S = { day: "tue" | "wed"; paused: boolean; toast: boolean; msg: string };

const START: S = { day: "tue", paused: false, toast: false, msg: "Paused Wed." };
const POSTER: S = { day: "wed", paused: true, toast: true, msg: "Paused Wed." };
const REST = { x: 200, y: 420 };

const script = async (a: Act<S>) => {
  await a.wait(1400);
  a.mark("pick");
  await a.click("wed");
  a.put({ day: "wed" });
  await a.wait(1500);
  a.mark("pause");
  await a.click("act");
  a.put({ paused: true, msg: "Paused Wed.", toast: true });
  await a.wait(3600);
  a.mark("resume");
  a.put({ toast: false });
  await a.wait(350);
  await a.click("act");
  a.put({ paused: false, msg: "Resumed Wed.", toast: true });
  await a.wait(1500);
  a.put({ toast: false });
  a.move(REST);
  await a.wait(300);
  await a.click("tue");
  a.put({ day: "tue" });
  await a.wait(1100);
};

const WEEK = [
  ["Mon", 2],
  ["Tue", 3],
  ["Wed", 4],
  ["Thu", 5],
  ["Fri", 6],
  ["Sat", 7],
  ["Sun", 8],
] as const;

/** Two stacked lines; the column slides up one line to show the second. */
function Flip({ a, b, on, h, className }: { a: string; b: string; on: boolean; h: number; className?: string }) {
  return (
    <span className={`pd-flip${className ? ` ${className}` : ""}`} style={{ height: h, lineHeight: `${h}px` }}>
      <span className="pd-flip__col" style={{ transform: on ? `translateY(-${h}px)` : undefined }}>
        <span style={{ height: h }}>{a}</span>
        <span style={{ height: h }}>{b}</span>
      </span>
    </span>
  );
}

/** `cutoffTime` is the real cutoff ("11:00 PM"); without it the line says only "the day before". */
export function PauseDemo({ className, cutoffTime }: { className?: string; cutoffTime?: string | null }) {
  return (
    <Stage<S>
      width={340}
      height={715}
      compact={{ below: 340, width: 300, height: 631 }}
      initial={START}
      poster={POSTER}
      script={script}
      cursor={{ at: REST, style: "touch" }}
      tokens={{ "--ss-font": "var(--font-poppins), Poppins, system-ui, sans-serif", "--ss-accent": "#F06B1A" }}
      className={`pd${className ? ` ${className}` : ""}`}
    >
      {(s, _rect, layout) => {
        const wed = s.day === "wed";
        return (
          <Phone width={layout === "compact" ? 300 : 340} wallpaper="#FBF4E7" className="pd-phone">
            <div className="pd-app">
              <div className="pd-head">
                <img src="/brand/mark.svg" alt="" width={40} height={40} className="pd-logo" />
                <span className="pd-pills">
                  <span className="pd-nav">
                    <Clock size={18} strokeWidth={2.2} className="pd-ic" />
                    11h 50m
                  </span>
                  <span className="pd-nav">
                    <Wallet size={18} strokeWidth={2.2} className="pd-ic" />0
                  </span>
                  <span className="pd-nav pd-nav--av">PK</span>
                </span>
              </div>

              <p className="pd-hi">
                Hi, <em>Priya.</em>
              </p>

              <div className="pd-surface pd-plan">
                <div className="pd-plan__title">4 Item Thali · Regular</div>
                <div className="pd-plan__sum">
                  <span className="pd-dot" style={{ background: "#10b981" }} />
                  <b>Active</b>
                  <span className="pd-mut">·</span>
                  <span className="pd-dot" style={{ background: "#dc2626" }} />
                  <span className="pd-mut">Non-veg</span>
                  <span className="pd-mut">· 20 of 20 tiffins left</span>
                </div>
                <div className="pd-plan__last">Last tiffin in 25 days</div>
                <span className="pd-btn pd-btn--outline">Pause or resume days</span>
              </div>

              <div className="pd-surface pd-week">
                <div className="pd-week__head">
                  <span className="pd-week__range">Nov 2 to Nov 8 · This week</span>
                  <span className="pd-week__nav">
                    <Info size={16} />
                    <ChevronLeft size={20} className="pd-off" />
                    <ChevronRight size={20} />
                  </span>
                </div>
                <div className="pd-days">
                  {WEEK.map(([wd, n], i) => {
                    const eat = i >= 0 && i <= 4;
                    const sel = (n === 3 && !wed) || (n === 4 && wed);
                    const paused = n === 4 && s.paused;
                    return (
                      <div key={n} className="pd-day" data-sel={sel || undefined} data-target={n === 4 ? "wed" : n === 3 ? "tue" : undefined}>
                        <span className="pd-day__wd">{wd}</span>
                        <span className="pd-day__n" data-today={n === 2 || undefined}>
                          {n}
                        </span>
                        <span className="pd-day__dot" style={{ background: eat ? (paused ? "#d98a00" : "#0ea5e9") : "transparent" }} />
                        <span className="pd-day__truck">{eat ? <Truck size={14} /> : null}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pd-del">
                <div className="pd-del__eyebrow">Delivery</div>
                <Flip a="Tue, Nov 3" b="Wed, Nov 4" on={wed} h={36} className="pd-del__title" />
                <Flip a={cutoffTime ? `Changes until Mon ${cutoffTime}` : "Changes until the day before"} b={cutoffTime ? `Changes until Tue ${cutoffTime}` : "Changes until the day before"} on={wed} h={22} className="pd-del__meta" />
              </div>

              <div className="pd-journey">
                <span className="pd-journey__track" />
                <span className="pd-stop pd-stop--now">
                  <span className="pd-stop__c">
                    <CalendarCheck size={20} />
                  </span>
                  Scheduled
                </span>
                <span className="pd-stop">
                  <span className="pd-stop__c">
                    <Truck size={16} />
                  </span>
                  On the way
                </span>
                <span className="pd-stop">
                  <span className="pd-stop__c">
                    <House size={16} />
                  </span>
                  Delivered
                </span>
              </div>

              <div className="pd-peek">
                <span className="pd-surface pd-peek__c">Sabzi · 8 oz</span>
                <span className="pd-surface pd-peek__c">Rice · 1 unit</span>
              </div>

              <div className="pd-toast" data-on={s.toast || undefined}>
                {s.msg}
              </div>

              <div className="pd-bar">
                <span className="pd-btn pd-btn--primary pd-bar__edit">Edit meal</span>
                <span className="pd-btn pd-btn--glass pd-bar__sm">Move</span>
                <span className="pd-btn pd-btn--glass pd-bar__sm" data-target="act">
                  <Flip a="Pause" b="Resume" on={s.paused} h={24} />
                </span>
                <span className="pd-fab">
                  <UtensilsCrossed size={26} strokeWidth={2} />
                </span>
              </div>

              <div className="pd-tabs">
                {[
                  ["Deliveries", CalendarCheck],
                  ["Support", LifeBuoy],
                  ["Refer", Gift],
                  ["Account", User],
                  ["More", Ellipsis],
                ].map(([label, Icon], i) => {
                  const I = Icon as typeof User;
                  return (
                    <span key={label as string} className="pd-tab" data-on={i === 0 || undefined}>
                      <I size={24} strokeWidth={1.9} />
                      {label as string}
                    </span>
                  );
                })}
              </div>
            </div>
          </Phone>
        );
      }}
    </Stage>
  );
}
