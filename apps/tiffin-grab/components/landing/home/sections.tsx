import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { BuildTiffinLink } from "@/components/landing/build-tiffin-link";
import { ArrowRight, Calculator, CalendarDays, CalendarRange, ChevronRight, CookingPot, Salad, type LucideIcon } from "lucide-react";
import { OfferCarousel } from "@/components/landing/promo/offer-carousel";
import type { LandingPromo } from "@/lib/landing/promo-types";
import type { BoardDay } from "@/components/landing/week-board";
import type { BoardWeekend } from "@/lib/landing/week-board";
import { HeroVideo } from "@/components/landing/home/hero-video";
import { SwipeRow } from "@/components/landing/home/swipe-row";
import { MenuBoard } from "@/components/landing/home/menu-board";
import { TodayPicks } from "@/components/landing/home/today-picks";

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const WEEK_LETTER: Record<(typeof WEEK)[number], string> = { mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S", sun: "S" };
const WEEK_SHORT: Record<(typeof WEEK)[number], string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

/** "Mon to Fri" for a run of days, "Mon, Wed, Fri" otherwise. */
function dayRange(days: string[]): string {
  const idx = WEEK.flatMap((d, i) => (days.includes(d) ? [i] : []));
  if (idx.length === 0) return "";
  const run = idx.length > 2 && idx.every((v, i) => i === 0 || v === idx[i - 1]! + 1);
  return run ? `${WEEK_SHORT[WEEK[idx[0]!]!]} to ${WEEK_SHORT[WEEK[idx[idx.length - 1]!]!]}` : idx.map((i) => WEEK_SHORT[WEEK[i]!]).join(", ");
}

/** The running promotion as a die-cut sticker on the hero: short headline in the middle,
 *  the offer text circling it. Staff pick it with the "Hero sticker" placement. */
function OfferSticker({ promo }: { promo: LandingPromo }) {
  const headline = promo.badge ?? promo.title;
  // The ring holds ~46 characters at its font size; a short phrase repeated reads cleaner than a
  // long blurb squeezed to fit.
  const segment = `${headline} · ${promo.code ?? promo.cta} · `;
  const ring = segment.repeat(Math.max(1, Math.floor(46 / segment.length)));
  return (
    <Link prefetch={false} href={promo.href} className="lp-sticker">
      <svg viewBox="0 0 200 200" aria-hidden>
        <defs><path id="lp-sticker-ring" d="M100,100 m-74,0 a74,74 0 1,1 148,0 a74,74 0 1,1 -148,0" /></defs>
        <circle cx="100" cy="100" r="97" fill="#FBF4E7" />
        <circle cx="100" cy="100" r="90" fill="#FF9843" />
        <g className="lp-sticker__spin"><text className="lp-sticker__ring"><textPath href="#lp-sticker-ring" textLength="462" lengthAdjust="spacing">{ring.toUpperCase()}</textPath></text></g>
        <circle cx="100" cy="100" r="58" fill="#2A5440" />
      </svg>
      <span className="lp-sticker__core">
        <strong>{headline}</strong>
        {/* Name from content (visible text first), so voice control can say what it sees. */}
        <span className="sr-only">: {promo.title}</span>
      </span>
    </Link>
  );
}

export function Hero({
  video, poster, offer, today, ctaHref, hasMenu, rating,
}: {
  video: string;
  poster: string;
  offer: LandingPromo | null;
  today: { day: string; isToday: boolean; choices: { row: string; dishes: string[] }[]; fixed: string[] } | null;
  ctaHref: string;
  hasMenu: boolean;
  rating: React.ReactNode;
}) {
  return (
    <section className="lp-hero dark" aria-labelledby="lp-hero-title">
      <div className="lp-hero__bg" aria-hidden>
        <HeroVideo desktop={{ src: video, poster }} phone={{ src: video.replace(/\.mp4$/, "-mobile.mp4"), poster: poster.replace(/\.jpg$/, "-mobile.jpg") }} />
        <div className="lp-hero__scrim" />
        <div className="lp-hero__melt" />
      </div>
      {offer ? <OfferSticker promo={offer} /> : null}
      <div className="lp-wrap lp-hero__inner">
        <div className="lp-hero__copy">
          {rating}
          <h1 id="lp-hero-title" className="lp-display">
            Home‑style tiffins.<br />Delivered <span className="c-accent">fresh.</span>
          </h1>
          <p className="lp-lede">Dal, rice, sabzi and fresh rotis, cooked in small batches and brought to your door across the GTA.</p>
          <div className="lp-actions lp-actions--start">
            <BuildTiffinLink href={ctaHref} className="lp-cta">Build my tiffin</BuildTiffinLink>
            {hasMenu ? <a href="#menu" className="lp-textlink lp-textlink--light">This week&apos;s menu <ChevronRight aria-hidden className="size-4" strokeWidth={2} /></a> : null}
          </div>
          {offer ? (
            <Link prefetch={false} href={offer.href} className="lp-ticket">
              <span className="lp-ticket__main">
                <strong>{offer.badge ?? offer.title}</strong>
                <small>{offer.blurb ?? offer.cta}</small>
              </span>
              <span className="lp-ticket__stub">{offer.code ?? offer.cta}<ArrowRight aria-hidden className="size-4" strokeWidth={2.2} /></span>
            </Link>
          ) : null}
        </div>
        <div className="lp-hero__cards">
          {today ? (
            <article className="lp-glass lp-hero__today" aria-label={`${today.day}'s tiffin`}>
              <header className="lp-today__head">
                <h2>{today.day}&apos;s tiffin</h2>
                {today.isToday ? <span className="lp-today__badge">Today</span> : null}
              </header>
              <TodayPicks rows={today.choices} />
              {today.fixed.length > 0 ? (
                <p className="lp-today__with"><span className="lp-today__label">With it</span>{today.fixed.join(" · ")}</p>
              ) : null}
              <a href="#menu" className="lp-today__link">See the week&apos;s menu <ArrowRight aria-hidden className="size-4" strokeWidth={2} /></a>
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Words as separate spans so each brightens as it scrolls through the view (CSS only). */
function Reveal({ text }: { text: string }) {
  return <>{text.split(" ").map((w, i) => <span key={i} className="lp-story__w">{w} </span>)}</>;
}

export function Story() {
  return (
    <section className="lp-story dark" aria-label="About Tiffin Grab">
      <div className="lp-wrap">
        <svg className="lp-story__mark" width="28" height="28" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0Z" /></svg>
        <p className="lp-story__text">
          <strong><Reveal text="Home‑style food, cooked the way a home kitchen does it." /></strong>{" "}
          <Reveal text="Small batches of dal, rice, sabzi and fresh rotis, packed into a tiffin and brought to your door across the GTA. You choose the diet, the size, the days and how many weeks. Away for a day? Pause it, and it waits for you." />
        </p>
        <p className="lp-story__quote">Your tiffin, your way.</p>
      </div>
    </section>
  );
}

export function OfferBand({ promos, photo }: { promos: LandingPromo[]; photo: StaticImageData }) {
  return (
    <section className="lp-section lp-offers" aria-labelledby="lp-offer">
      <div className="lp-wrap">
        <header className="lp-head lp-head--split">
          <div>
            <span className="lp-kicker">Running now</span>
            <h2 id="lp-offer" className="lp-h2">Offers on your <span className="c-accent">tiffin.</span></h2>
          </div>
          <p className="lp-lede">Codes apply at checkout. You see the price drop before you pay.</p>
        </header>
        <OfferCarousel promos={promos} photo={photo} label="Offers on your tiffin" />
      </div>
    </section>
  );
}

type Plan = { key: string; name: string; description: string | null; soon: boolean };
type Size = { id: string; name: string; note: string };
type Side = { key: string; name: string; note: string | null };
type Frequency = { id: string; name: string; days: string[] };
type Length = { weeks: number; off: number };

/** "About 2 months", "Try it out": what a plan length means, unless a real discount says more. */
function weekNote(weeks: number, off: number): string {
  if (off > 0) return `${off}% off`;
  if (weeks === 1) return "Try it out";
  if (weeks % 4 === 0) return weeks === 4 ? "About a month" : `About ${weeks / 4} months`;
  return `${weeks * 7} days`;
}

/** Big faint icon behind a card's content: says what the card is about at a glance. */
function Mark({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon aria-hidden className="lp-tile__mark" strokeWidth={1.25} />;
}

const money = (n: number) => `$${n.toFixed(2)}`;

export function Bento({ plans, sizes, sizePlanKey, sides, frequencies, lengths, cutoff, fromRate, photo }: {
  plans: Plan[]; sizes: Size[]; sizePlanKey: string | null; sides: Side[]; frequencies: Frequency[]; lengths: Length[]; cutoff: string | null; fromRate: number | null; photo: StaticImageData;
}) {
  const maxOff = Math.max(0, ...lengths.map((l) => l.off));
  const names = ["Diet", "Size", ...(sides.length > 0 ? ["Sides"] : []), "Days", "Weeks", "Price", "Photo"];
  return (
    <section className="lp-section lp-build" aria-labelledby="lp-build">
      {/* The same warm, blurred food wash as the menu: the glass cards read as glass over it. */}
      <div className="lp-wash" aria-hidden>
        <Image src={photo} alt="" fill sizes="256px" placeholder="blur" />
      </div>
      <div className="lp-wrap">
        <header className="lp-head lp-head--split">
          <div>
            <span className="lp-kicker">Four picks, one price</span>
            <h2 id="lp-build" className="lp-h2">Your tiffin, <span className="c-accent">your way.</span></h2>
          </div>
          <p className="lp-lede">A few quick choices. You see the full price before you pay.</p>
        </header>
        <SwipeRow className={sides.length > 0 ? "lp-bento lp-bento--sides" : "lp-bento"} label="Plan builder cards" names={names}>
          <article className="lp-tile lp-tile--diet">
            <Mark icon={Salad} />
            <span className="lp-step"><Salad aria-hidden className="size-4" strokeWidth={2} />1 · Diet</span>
            <h3 className="lp-tile__title">{plans.length > 2 ? "Veg, non‑veg or something lighter." : "Veg or non‑veg. Your call."}</h3>
            <ul className="lp-list">
              {plans.map((p) => (
                <li key={p.key}>
                  {p.soon ? (
                    <span className="lp-list__row" aria-disabled="true"><span><strong>{p.name}</strong>{p.description ? <small>{p.description}</small> : null}</span><em className="lp-soon">Coming soon</em></span>
                  ) : (
                    <Link prefetch={false} href={`/subscribe?p=${encodeURIComponent(p.key)}`} className="lp-list__row lp-list__row--link">
                      <span><strong>{p.name}</strong>{p.description ? <small>{p.description}</small> : null}</span>
                      <ArrowRight aria-hidden className="size-4 shrink-0" strokeWidth={2} />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </article>

          <article className="lp-tile lp-tile--size">
            <Mark icon={CookingPot} />
            <span className="lp-step"><CookingPot aria-hidden className="size-4" strokeWidth={2} />2 · Size<span className="lp-step__chip">sets the rate</span></span>
            <h3 className="lp-tile__title">As much as you need.</h3>
            {sizes.length > 0 ? (
              <ul className="lp-sizes">
                {sizes.map((m) => (
                  <li key={m.id}>
                    {sizePlanKey ? (
                      <Link prefetch={false} href={`/subscribe?p=${encodeURIComponent(sizePlanKey)}&m=${encodeURIComponent(m.id)}`} className="lp-size">
                        <strong>{m.name}</strong><small>{m.note}</small>
                        <ArrowRight aria-hidden className="size-4 shrink-0" strokeWidth={2} />
                      </Link>
                    ) : <span className="lp-size"><strong>{m.name}</strong><small>{m.note}</small></span>}
                  </li>
                ))}
              </ul>
            ) : <p className="lp-note">Every size shows calories, protein, carbs and fat before you pick.</p>}
          </article>

          {sides.length > 0 ? (
            <article className="lp-tile lp-tile--row">
              <span className="lp-step">Sides</span>
              <h3 className="lp-tile__title">A little extra.</h3>
              <ul className="lp-pills">{sides.map((x) => <li key={x.key}>{x.name}{x.note && !x.name.toLowerCase().includes(x.note.toLowerCase()) ? <small> · {x.note}</small> : null}</li>)}</ul>
            </article>
          ) : null}

          <article className="lp-tile lp-tile--row">
            <Mark icon={CalendarDays} />
            <span className="lp-step"><CalendarDays aria-hidden className="size-4" strokeWidth={2} />3 · Days<span className="lp-step__chip">× days</span></span>
            <h3 className="lp-tile__title">On the days you choose.</h3>
            <ul className="lp-freq">
              {frequencies.map((f) => (
                <li key={f.id}>
                  <span className="lp-freq__head"><strong>{f.days.length} {f.days.length === 1 ? "day" : "days"}</strong><span>{dayRange(f.days)}</span></span>
                  <span className="lp-weekbar" aria-hidden>
                    {WEEK.map((d) => <span key={d} data-on={f.days.includes(d)}><i />{WEEK_LETTER[d]}</span>)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="lp-note">{cutoff ? `Pause any day before ${cutoff} the day before.` : "Pause any day before the cutoff."}</p>
          </article>

          <article className="lp-tile lp-tile--row">
            <Mark icon={CalendarRange} />
            <span className="lp-step"><CalendarRange aria-hidden className="size-4" strokeWidth={2} />4 · Weeks<span className="lp-step__chip">× weeks</span></span>
            <h3 className="lp-tile__title">{maxOff > 0 ? <>Longer plans, up to <span className="c-accent">{maxOff}% off.</span></> : "For as long as you like."}</h3>
            <ul className="lp-weeks">
              {lengths.map((l) => (
                <li key={l.weeks} data-off={l.off > 0}>
                  <strong>{l.weeks}</strong>
                  <span>{l.weeks === 1 ? "week" : "weeks"}</span>
                  <em>{weekNote(l.weeks, l.off)}</em>
                </li>
              ))}
            </ul>
            <p className="lp-note">Weeks run in a row. Renew or stop when they end.</p>
          </article>

          <article className="lp-tile lp-tile--row lp-tile--price dark">
            <Mark icon={Calculator} />
            <span className="lp-step"><Calculator aria-hidden className="size-4" strokeWidth={2} />Price</span>
            <h3 className="lp-tile__title">No packages. Just math.</h3>
            {fromRate != null ? (
              <p className="lp-from"><span>from</span><strong>{money(fromRate)}</strong><span>a tiffin</span></p>
            ) : null}
            <p className="lp-formula"><span>rate</span><b aria-hidden>×</b><span>days</span><b aria-hidden>×</b><span>weeks</span></p>
            <p className="lp-note">{maxOff > 0 ? `Longer plans save up to ${maxOff}% on the rate.` : "Pick a size to see its rate, then your days and weeks."}</p>
            <div className="lp-actions lp-actions--start">
              <Link prefetch={false} href="/subscribe" className="lp-cta lp-cta--sm">See my price</Link>
              <Link href="/pricing" className="lp-textlink">Pricing table <ChevronRight aria-hidden className="size-4" strokeWidth={2} /></Link>
            </div>
          </article>

          {/* Last: the four picks and the price come first in the phone swipe row. */}
          {/* The photo is landscape and the card portrait: the fill crop needs ~1.6x the card width. */}
          <figure className="lp-tile lp-tile--photo">
            <Image src={photo} alt="A home-style thali: sabzi, dal, rice and rotis in steel katoris" placeholder="blur" fill sizes="(max-width: 640px) 165vw, (max-width: 1000px) 50vw, 420px" />
            <figcaption className="lp-photo-cap">Dal, sabzi and fresh rotis, packed the same morning.<a href="#menu">See this week&apos;s menu <ArrowRight aria-hidden className="size-4" strokeWidth={2} /></a></figcaption>
          </figure>
        </SwipeRow>
      </div>
    </section>
  );
}

export function MenuRail({ days, rows, weekend, cutoffTime, range, photo }: { days: BoardDay[]; rows: string[]; weekend: BoardWeekend | null; cutoffTime: string | null; range: string; photo: StaticImageData }) {
  return (
    <section id="menu" className="lp-section lp-menu scroll-mt-24" aria-labelledby="lp-menu">
      {/* A warm wash of real food behind the glass: blurred, so it reads as colour and light. */}
      <div className="lp-menu__bg" aria-hidden>
        <Image src={photo} alt="" fill sizes="256px" placeholder="blur" />
      </div>
      <div className="lp-wrap">
        <header className="lp-head lp-head--split">
          <div>
            <span className="lp-kicker">{range}</span>
            <h2 id="lp-menu" className="lp-h2">On the menu this <span className="c-accent">week.</span></h2>
          </div>
          <Link href="/menu/weekly" className="lp-textlink">Full menu and PDF <ChevronRight aria-hidden className="size-4" strokeWidth={2} /></Link>
        </header>
        <MenuBoard days={days} rows={rows} weekend={weekend} cutoffTime={cutoffTime} />
      </div>
    </section>
  );
}

export function Flex({ cutoff, demo }: { cutoff: string | null; demo: React.ReactNode }) {
  const steps = [
    { t: "Build your plan", d: "Diet, size, days and weeks. Pay by card or Interac e‑Transfer." },
    { t: "We cook it fresh", d: "Pick dishes from each released week's menu. Small batches, the way a home kitchen does it." },
    { t: "Pause or move any day", d: `${cutoff ? `Before ${cutoff} the day before. ` : ""}A paused day is never lost: move it, or it goes to the end of your plan.` },
  ];
  return (
    <section className="lp-section lp-flex dark" aria-labelledby="lp-flex">
      <div className="lp-wrap lp-flex__grid">
        <div className="lp-flex__copy">
          <span className="lp-kicker">How it works</span>
          <h2 id="lp-flex" className="lp-h2">A week that bends, not <span className="c-accent">breaks.</span></h2>
          <ol className="lp-points">
            {steps.map((s, i) => (
              <li key={s.t}><strong><span className="lp-points__n">{i + 1}</span>{s.t}</strong><span>{s.d}</span></li>
            ))}
          </ol>
          <div><BuildTiffinLink className="lp-cta">Build my tiffin</BuildTiffinLink></div>
        </div>
        <div className="lp-flex__stage">{demo}</div>
      </div>
    </section>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section className="lp-section" aria-labelledby="lp-faq">
      <div className="lp-wrap lp-faq">
        <header className="lp-faq__head">
          <h2 id="lp-faq" className="lp-h2">Before you <span className="c-accent">order.</span></h2>
          <Link href="/faq" className="lp-textlink">Every question we get <ChevronRight aria-hidden className="size-4" strokeWidth={2} /></Link>
        </header>
        <div className="lp-faq__list">
          {items.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
