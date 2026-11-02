"use client";

import { CalendarCheck, ChevronDown, ChevronLeft, ChevronRight, Clock, Ellipsis, Gift, House, Info, LifeBuoy, MapPin, Pencil, Truck, User, UtensilsCrossed, Wallet, X } from "lucide-react";
import { useEffect } from "react";
import { Phone, Stage, type Act } from "./kit";
import "./menu-pick-demo.css";

// The customer Deliveries screen with the Edit meal sheet over it, light theme.
// Tap Edit meal, open the choice row, tap the second dish (the button turns
// Done to Save), Save: the sheet closes, the page scrolls to the day's meal
// tiles and the new dish is there. Reset has a seen cause: the page scrolls
// back and another day is tapped, then this one again.

type S = { day: "own" | "other"; sheet: boolean; open: boolean; pick: 0 | 1; saved: 0 | 1; toast: boolean; scrolled: boolean; half: boolean };

const START: S = { day: "own", sheet: false, open: false, pick: 0, saved: 0, toast: false, scrolled: false, half: false };
// Calm frame for reduced motion: new dish in place, scrolled just far enough that the tiles clear the action bar.
const POSTER: S = { day: "own", sheet: false, open: false, pick: 1, saved: 1, toast: false, scrolled: false, half: true };
const REST = { x: 200, y: 420 };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const script = async (a: Act<S>) => {
  await a.wait(1500);
  a.mark("edit");
  await a.click("edit");
  await a.set({ sheet: true });
  await a.wait(1100);
  a.mark("open");
  await a.click("cat");
  await a.set({ open: true });
  await a.wait(900);
  a.mark("pick");
  await a.click("dish");
  a.put({ pick: 1 });
  await a.wait(1000);
  a.mark("save");
  await a.click("save");
  a.put({ sheet: false, open: false, saved: 1, toast: true, scrolled: true });
  await a.wait(3800);
  a.mark("reset");
  a.put({ toast: false, scrolled: false });
  a.move(REST);
  await a.wait(1000);
  await a.click("other");
  a.put({ day: "other" });
  await a.wait(700);
  await a.snap({ pick: 0, saved: 0 });
  await a.click("own");
  a.put({ day: "own" });
  a.move(REST);
  await a.wait(1100);
};

type Cat = { category: string; dishes: string[] };

function Flip({ a, b, on, h, className }: { a: string; b: string; on: boolean; h: number; className?: string }) {
  return (
    <span className={`mp-flip${className ? ` ${className}` : ""}`} style={{ height: h, lineHeight: `${h}px` }}>
      <span className="mp-flip__col" style={{ transform: on ? `translateY(-${h}px)` : undefined }}>
        <span style={{ height: h }}>{a}</span>
        <span style={{ height: h }}>{b}</span>
      </span>
    </span>
  );
}

/** Tells the page which dish was just saved while "Meals saved" shows (null otherwise), so the
 *  week board beside the phone can light the same dish. Renders nothing. */
function SavedSignal({ dish, onSaved }: { dish: string | null; onSaved?: (dish: string | null) => void }) {
  useEffect(() => { onSaved?.(dish); }, [dish, onSaved]);
  return null;
}

export function MenuPickDemo({
  dayLabel,
  dayShort,
  options,
  compact: forceCompact,
  className,
  cutoffTime,
  onSaved,
}: {
  dayLabel: string;
  dayShort: string;
  options: Cat[];
  compact?: boolean;
  className?: string;
  /** The real cutoff ("11:00 PM"); without it the line says only "the day before". */
  cutoffTime?: string | null;
  onSaved?: (dish: string | null) => void;
}) {
  const rows = options.filter((o) => o.dishes.length > 0);
  const pickAt = rows.findIndex((o) => o.dishes.length > 1);
  const live = pickAt >= 0;
  const shown = rows.slice(0, 4);
  if (live && pickAt >= 4) shown[3] = rows[pickAt]!;
  const picked = live ? rows[pickAt]! : null;
  const dishes = picked ? picked.dishes.slice(0, 4) : [];

  const di = Math.max(0, FULL.indexOf(dayLabel));
  const oi = di === 6 ? 5 : di + 1;
  const other = FULL[oi]!;
  const otherShort = DAYS[oi]!;
  const cutoff = (i: number) => (cutoffTime ? `Changes until ${DAYS[(i + 6) % 7]} ${cutoffTime}` : "Changes until the day before");
  const ownIdx = DAYS.indexOf(dayShort);

  return (
    <Stage<S>
      width={340}
      height={715}
      compact={{ below: forceCompact ? 100000 : 340, width: 300, height: 631 }}
      initial={START}
      poster={live ? POSTER : { ...START, half: true }}
      script={live ? script : undefined}
      cursor={live ? { at: REST, style: "touch" } : undefined}
      tokens={{ "--ss-font": "var(--font-poppins), Poppins, system-ui, sans-serif", "--ss-accent": "#F06B1A" }}
      className={`mp${className ? ` ${className}` : ""}`}
    >
      {(s, _rect, layout) => {
        const away = s.day === "other";
        const name = (c: Cat) => (c === picked ? c.dishes[s.saved]! : c.dishes[0]!);
        const sheetName = (c: Cat) => (c === picked ? c.dishes[s.pick]! : c.dishes[0]!);
        const tileCount = Math.max(2, shown.length + (shown.length % 2));
        const tileRows = tileCount / 2;
        const tilesBottom = 700 + tileRows * 90 - 10;
        const scrollBy = s.scrolled ? tilesBottom - 564 : s.half ? tilesBottom - 672 : 0;
        return (
          <Phone width={layout === "compact" ? 300 : 340} wallpaper="#FBF4E7" className="mp-phone">
            <div className="mp-app">
              <div className="mp-head">
                <img src="/brand/mark.svg" alt="" width={40} height={40} className="mp-logo" />
                <span className="mp-pills">
                  <span className="mp-nav">
                    <Clock size={18} strokeWidth={2.2} className="mp-ic" />
                    11h 50m
                  </span>
                  <span className="mp-nav">
                    <Wallet size={18} strokeWidth={2.2} className="mp-ic" />0
                  </span>
                  <span className="mp-nav mp-nav--av">PK</span>
                </span>
              </div>

              <div className="mp-scroll" data-scrolled={s.scrolled || s.half || undefined} style={{ ["--mp-s" as string]: scrollBy }}>
                <p className="mp-hi">
                  Hi, <em>Priya.</em>
                </p>

                <div className="mp-surface mp-plan">
                  <div className="mp-plan__title">4 Item Thali · Regular</div>
                  <div className="mp-plan__sum">
                    <span className="mp-dot" style={{ background: "#10b981" }} />
                    <b>Active</b>
                    <span className="mp-mut">·</span>
                    <span className="mp-dot" style={{ background: "#dc2626" }} />
                    <span className="mp-mut">Non-veg</span>
                    <span className="mp-mut">· 20 of 20 tiffins left</span>
                  </div>
                  <div className="mp-plan__last">Last tiffin in 25 days</div>
                  <span className="mp-btn mp-btn--outline">Pause or resume days</span>
                </div>

                <div className="mp-surface mp-week">
                  <div className="mp-week__head">
                    <span className="mp-week__range">This week</span>
                    <span className="mp-week__nav">
                      <Info size={16} />
                      <ChevronLeft size={20} className="mp-off" />
                      <ChevronRight size={20} />
                    </span>
                  </div>
                  <div className="mp-days">
                    {DAYS.map((wd, i) => {
                      const eat = i <= 4;
                      const sel = away ? i === oi : i === ownIdx;
                      return (
                        <div key={wd} className="mp-day" data-sel={sel || undefined} data-target={i === ownIdx ? "own" : i === oi ? "other" : undefined}>
                          <span className="mp-day__wd">{wd}</span>
                          <span className="mp-day__n" data-today={i === 0 || undefined}>
                            {i + 2}
                          </span>
                          <span className="mp-day__dot" style={{ background: eat ? "#0ea5e9" : "transparent" }} />
                          <span className="mp-day__truck">{eat ? <Truck size={14} /> : null}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mp-del">
                  <div className="mp-del__eyebrow">Delivery</div>
                  <Flip a={dayLabel} b={other} on={away} h={36} className="mp-del__title" />
                  <Flip a={cutoff(di)} b={cutoff(oi)} on={away} h={22} className="mp-del__meta" />
                </div>

                <div className="mp-journey">
                  <span className="mp-journey__track" />
                  <span className="mp-stop mp-stop--now">
                    <span className="mp-stop__c">
                      <CalendarCheck size={20} />
                    </span>
                    Scheduled
                  </span>
                  <span className="mp-stop">
                    <span className="mp-stop__c">
                      <Truck size={16} />
                    </span>
                    On the way
                  </span>
                  <span className="mp-stop">
                    <span className="mp-stop__c">
                      <House size={16} />
                    </span>
                    Delivered
                  </span>
                </div>

                <ul className="mp-tiles">
                  {Array.from({ length: tileCount }, (_, i) => {
                    const c = shown[i];
                    return c && !away ? (
                      <li key={c.category} className="mp-tile" data-flash={(c === picked && s.saved === 1) || undefined}>
                        <span className="mp-tile__k">{c.category}</span>
                        <span className="mp-tile__v">{name(c)}</span>
                      </li>
                    ) : (
                      <li key={i} className="mp-tile">
                        <span className="mp-bone mp-bone--s" />
                        <span className="mp-bone mp-bone--m" />
                      </li>
                    );
                  })}
                </ul>
                <div className="mp-count" style={{ top: tilesBottom + 12 }}>
                  1 tiffin
                </div>
                <div className="mp-dest" style={{ top: tilesBottom + 50 }}>
                  <div className="mp-dest__k">Destination</div>
                  <div className="mp-dest__row">
                    <MapPin size={20} />
                    Your delivery address
                    <span className="mp-dest__edit">
                      <Pencil size={14} /> Edit
                    </span>
                  </div>
                </div>
              </div>

              <SavedSignal dish={s.toast && picked ? picked.dishes[1] ?? null : null} onSaved={onSaved} />
              <div className="mp-toast" data-on={s.toast || undefined} style={{ top: 511 - tilesBottom + 564 }}>
                Meals saved
              </div>

              <div className="mp-bar">
                <span className="mp-btn mp-btn--primary mp-bar__edit" data-target="edit">
                  Edit meal
                </span>
                <span className="mp-btn mp-btn--glass mp-bar__sm">Move</span>
                <span className="mp-btn mp-btn--glass mp-bar__sm">Pause</span>
                <span className="mp-fab">
                  <UtensilsCrossed size={26} strokeWidth={2} />
                </span>
              </div>

              <div className="mp-tabs">
                {[
                  ["Deliveries", CalendarCheck],
                  ["Support", LifeBuoy],
                  ["Refer", Gift],
                  ["Account", User],
                  ["More", Ellipsis],
                ].map(([label, Icon], i) => {
                  const I = Icon as typeof User;
                  return (
                    <span key={label as string} className="mp-tab" data-on={i === 0 || undefined}>
                      <I size={24} strokeWidth={1.9} />
                      {label as string}
                    </span>
                  );
                })}
              </div>

              <div className="mp-scrim" data-on={s.sheet || undefined} />
              <div className="mp-sheet" data-on={s.sheet || undefined} data-open={s.open || undefined}>
                <span className="mp-grip" />
                <div className="mp-sheet__head">
                  <h2>Edit meal</h2>
                  <span className="mp-x">
                    <X size={20} />
                  </span>
                </div>
                <p className="mp-sheet__reason">
                  <Info size={20} />
                  Pick a dish for each item.
                </p>
                <h3 className="mp-sheet__day">{dayLabel}</h3>
                <div className="mp-list">
                  {shown.map((c) => {
                    const isPick = c === picked;
                    const on = isPick && s.open;
                    const status = isPick ? (s.pick === 1 ? "Changed" : "") : "Included";
                    return (
                      <section key={c.category} className="mp-cat">
                        <div className="mp-cat__row" data-target={isPick ? "cat" : undefined}>
                          <span className="mp-cat__txt">
                            <span className="mp-cat__k">{c.category}</span>
                            <span className="mp-cat__v">{sheetName(c)}</span>
                          </span>
                          {status && <span className="mp-cat__st">{status}</span>}
                          <ChevronDown size={20} className="mp-chev" style={{ transform: on ? "rotate(180deg)" : undefined }} />
                        </div>
                        {isPick && (
                          <div className="mp-cat__body" data-on={on || undefined}>
                            <div>
                              <div className="mp-grid">
                                {dishes.map((d, i) => (
                                  <span key={d} className="mp-choice" data-sel={s.pick === i || undefined} data-target={i === 1 ? "dish" : undefined}>
                                    <span>{d}</span>
                                    <span className="mp-radio">{s.pick === i && <span />}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
                <div className="mp-sheet__foot">
                  <span className="mp-btn mp-save" data-target="save">
                    {s.pick === 1 ? "Save" : "Done"}
                  </span>
                </div>
              </div>
            </div>
          </Phone>
        );
      }}
    </Stage>
  );
}
