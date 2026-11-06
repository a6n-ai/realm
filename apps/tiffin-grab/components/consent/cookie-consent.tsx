"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CONSENT_COOKIE, CONSENT_VERSION, consentCookieDomain, parseConsent, type Consent } from "@/lib/consent";
import { consentCardOn } from "./card-visible";

// Cookie consent for Canadian rules (PIPEDA; Quebec Law 25 s. 8.1): anything that tracks a
// visitor is OFF until they say yes, saying no is one tap like saying yes, and the choice
// can be changed any time (footer "Cookie settings"). Essential cookies (sign-in, delivery
// area, referral code) need no consent and always run. The only non-essential tracker is
// the tracking bootstrap (/api/analytics: Google Analytics and the Meta Pixel), so it is not
// even loaded until the visitor accepts; server-side sends check the same cookie.
//
// Asked once per browser: the cookie lives on the registrable domain (tiffingrab.ca), so the
// signed-in app (app.tiffingrab.ca) reads the same answer instead of asking again.

// Ask again after 12 months, or when CONSENT_VERSION changes.
const MAX_AGE = 60 * 60 * 24 * 365;
const OPEN_EVENT = "tg:consent-open";
// Asked at a moment that means something, never on arrival: when a page signals one (MOMENT_EVENT, e.g.
// the first tap in the pricing calculator) or once the visitor has read this many screens. Once per visit.
const MOMENT_EVENT = "tg:consent-moment";
const ASK_DEPTH = 1.5;
// Matches the lid-drop + slide-out in cookie-consent.css.
const EXIT_MS = 560;
// Unanswered and scrolled past this share of a screen, the ask folds back into the dock. It is shown once
// per visit whatever happens. Silence is "no": analytics stays off, and the next visit asks again.
const SNOOZE_SCROLL = 0.75;
const SNOOZE_KEY = "tg-consent-asked";

// The question fits the page it is asked on; each one says what the visitor's yes is for.
const QUESTIONS: Record<string, string> = {
  "/pricing": "Help us see which plans people compare?",
  "/menu": "Help us see which dishes people look at?",
  "/refer": "Help us see how friends find us?",
};
const question = (path: string) => QUESTIONS[path] ?? "Help us see which pages help you pick a tiffin?";

/** Pages call this at a meaningful moment (a first tap in a tool) to ask then instead of on scroll depth. */
export function consentMoment() { dispatchEvent(new Event(MOMENT_EVENT)); }
const snoozed = () => { try { return sessionStorage.getItem(SNOOZE_KEY) === "1"; } catch { return false; } };

function readConsent(): Consent | null {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`))?.slice(CONSENT_COOKIE.length + 1);
  return parseConsent(raw);
}

function writeConsent(analytics: boolean): Consent {
  const c: Consent = { v: CONSENT_VERSION, analytics, at: Date.now() };
  const secure = location.protocol === "https:" ? "; Secure" : "";
  const domain = consentCookieDomain(location.hostname);
  // A host-only cookie from before the shared one would shadow it on this host: clear it first.
  if (domain) document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(c))}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax${domain ? `; Domain=.${domain}` : ""}${secure}`;
  return c;
}

let gaLoaded = false;
function loadAnalytics() {
  if (gaLoaded) return;
  gaLoaded = true;
  const s = document.createElement("script");
  s.src = "/api/analytics";
  s.async = true;
  document.body.appendChild(s);
}

// Withdrawing consent: stop GA from sending more and drop its cookies. A reload clears the
// already-loaded script.
function stopAnalytics() {
  const w = window as unknown as { gtag?: (...a: unknown[]) => void };
  w.gtag?.("consent", "update", { analytics_storage: "denied", ad_storage: "denied" });
  (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq?.("consent", "revoke");
  const host = location.hostname.split(".").slice(-2).join(".");
  for (const c of document.cookie.split("; ")) {
    const name = c.split("=")[0];
    if (name && /^(_ga|_fbp|_fbc)/.test(name)) {
      for (const domain of ["", `; Domain=.${host}`]) document.cookie = `${name}=; Max-Age=0; Path=/${domain}`;
    }
  }
}

/** Saves an answer given outside the cookie card (the customer app's prompt) with the card's own effects. */
export function saveConsent(yes: boolean) {
  const before = readConsent()?.analytics ?? false;
  writeConsent(yes);
  if (yes) loadAnalytics();
  else if (before) stopAnalytics();
}

/** True once the visitor has answered, on this host or any tiffingrab.ca host. */
export function hasConsentAnswer() { return readConsent() != null; }

/** Hairline tiffin carrier: each tier is a kind of cookie. Two essential tiers always packed,
 *  the top (analytics) tier fills saffron only when allowed; the lid drops on the decision. */
function TiffinFigure() {
  return (
    <svg className="tg-consent__tiffin" viewBox="0 0 80 100" aria-hidden focusable="false">
      <path className="tg-consent__handle" d="M8 80 V24 Q8 8 40 8 Q72 8 72 24 V80 M8 80 h6 M72 80 h-6" />
      <g className="tg-consent__tier tg-consent__tier--3">
        <path d="M14 72 V86 A26 6 0 0 0 66 86 V72" />
        <ellipse cx="40" cy="72" rx="26" ry="6" />
      </g>
      <g className="tg-consent__tier tg-consent__tier--2">
        <path d="M14 56 V70 A26 6 0 0 0 66 70 V56" />
        <ellipse cx="40" cy="56" rx="26" ry="6" />
      </g>
      <g className="tg-consent__tier tg-consent__tier--opt">
        <path d="M14 40 V54 A26 6 0 0 0 66 54 V40" />
        <ellipse cx="40" cy="40" rx="26" ry="6" />
        <path className="tg-consent__steam" d="M33 33 q-3 -4 0 -8 M40 32 q-3 -4 0 -8 M47 33 q-3 -4 0 -8" />
      </g>
      <g className="tg-consent__lid">
        <ellipse cx="40" cy="38" rx="27" ry="6.5" />
        <path d="M36 31.5 h8" />
      </g>
    </svg>
  );
}

export function CookieConsent() {
  const path = usePathname() ?? "/";
  const ask = consentCardOn(path);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [details, setDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [reopened, setReopened] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The phone action pill steps aside while this card is up (html[data-consent="open"]).
  const shown = open && (ask || reopened);
  const slim = !details && !reopened;
  useEffect(() => {
    const root = document.documentElement;
    if (shown) root.dataset.consent = "open";
    else delete root.dataset.consent;
    return () => { delete root.dataset.consent; };
  }, [shown]);

  useEffect(() => {
    const c = readConsent();
    let disarm = () => {};
    if (c) {
      setAnalytics(c.analytics);
      if (c.analytics) loadAnalytics();
    } else if (ask && !snoozed()) {
      let done = false;
      const show = () => {
        if (done) return;
        done = true;
        disarm();
        try { sessionStorage.setItem(SNOOZE_KEY, "1"); } catch {}
        setOpen(true);
      };
      const onScroll = () => { if (scrollY > innerHeight * ASK_DEPTH) show(); };
      addEventListener("scroll", onScroll, { passive: true });
      addEventListener(MOMENT_EVENT, show);
      // Leaving the public site before the ask shows: never let it pop up on /me or /login.
      disarm = () => {
        removeEventListener("scroll", onScroll);
        removeEventListener(MOMENT_EVENT, show);
      };
    }
    const reopen = () => {
      clearTimeout(timer.current);
      setAnalytics(readConsent()?.analytics ?? false);
      setDetails(true);
      setReopened(true);
      setClosing(false);
      setOpen(true);
    };
    addEventListener(OPEN_EVENT, reopen);
    return () => {
      disarm();
      removeEventListener(OPEN_EVENT, reopen);
      clearTimeout(timer.current);
    };
  }, [ask]);

  // The bar leaves the screen: the tiffin's lid drops, then it slides out (the dock stays put underneath).
  const leave = () => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The tiffin shows the answer (top tier filled or empty), the lid drops, then the card leaves.
    setClosing(true);
    timer.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
      setDetails(false);
    }, reduce ? 0 : EXIT_MS);
  };

  const decide = (yes: boolean) => {
    const before = readConsent()?.analytics ?? false;
    writeConsent(yes);
    if (yes) loadAnalytics();
    else if (before) stopAnalytics();
    setAnalytics(yes);
    leave();
  };

  // Reading on without answering: the first ask gets out of the way instead of riding along every screen.
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    if (!shown || !slim || reopened) return;
    const start = scrollY;
    const onScroll = () => {
      if (Math.abs(scrollY - start) < innerHeight * SNOOZE_SCROLL) return;
      removeEventListener("scroll", onScroll);
      leaveRef.current();
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, [shown, slim, reopened]);

  // Opened unasked on the public site and then left it: it waits for the next public page.
  // Opened from "Cookie settings" it shows anywhere.
  if (!shown) return null;

  return (
    <section
      className="tg-consent"
      role="region"
      aria-label="Cookie choices"
      data-reopened={reopened || undefined}
      data-analytics={analytics || undefined}
      data-closing={closing || undefined}
      data-slim={slim || undefined}
    >
      {slim ? (
        // First ask: a slim bar, so the hero headline and its CTA stay in view. Choose opens the full card.
        <p className="tg-consent__text">
          {/* Phones show the short label in the dock-sized capsule; wider screens the full sentence. */}
          <strong className="tg-consent__q">{question(path)}</strong>{" "}
          <span className="tg-consent__long">Analytics cookies, only if you say yes.</span>{" "}
          <span className="tg-consent__links">
            <button type="button" className="tg-consent__link" onClick={() => setDetails(true)}>Choose</button>
            <span aria-hidden> · </span>
            <Link href="/privacy#s8" className="tg-consent__link">Privacy</Link>
          </span>
        </p>
      ) : (
      <div className="tg-consent__head">
        <TiffinFigure />
        <div className="tg-consent__body">
          <p className="tg-consent__eyebrow">Before we pack your visit</p>
          <h2 className="tg-consent__title">Essentials always come in the box. The extra tier is your call.</h2>
          <p className="tg-consent__text">
            Essential cookies keep you signed in and remember your delivery area. With your OK, Google Analytics and the
            Meta pixel show us which pages and ads help people find their tiffin.{" "}
            <Link href="/privacy#s8">Privacy policy</Link>
          </p>
        </div>
      </div>
      )}
      {details ? (
        <ul className="tg-consent__list">
          <li>
            <div>
              <strong>Essential</strong>
              <span>Sign-in, delivery area, checkout and referral codes. The site needs these to work.</span>
            </div>
            <span className="tg-consent__always">Always packed</span>
          </li>
          <li>
            <label htmlFor="tg-consent-analytics">
              <strong>Analytics and ads</strong>
              <span>Google Analytics and the Meta pixel: which pages you visit and which ads brought you here.</span>
            </label>
            <input
              id="tg-consent-analytics"
              type="checkbox"
              role="switch"
              className="tg-consent__switch"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
            />
          </li>
        </ul>
      ) : null}
      <div className="tg-consent__actions">
        {details ? (
          <button type="button" className="tg-consent__btn tg-consent__btn--primary" onClick={() => decide(analytics)}>Save choices</button>
        ) : slim ? null : (
          <button type="button" className="tg-consent__btn tg-consent__btn--ghost" onClick={() => setDetails(true)}>Choose</button>
        )}
        <button type="button" className="tg-consent__btn" data-act="no" onClick={() => decide(false)}>{slim ? "No thanks" : "Essential only"}</button>
        <button type="button" className="tg-consent__btn" data-act="yes" onClick={() => decide(true)}>{slim ? "Yes, OK" : "Accept all"}</button>
      </div>
    </section>
  );
}

/** Footer link that reopens the choices. */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => dispatchEvent(new Event(OPEN_EVENT))}>
      Cookie settings
    </button>
  );
}
