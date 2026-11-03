"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import "./cookie-consent.css";

// Cookie consent for Canadian rules (PIPEDA; Quebec Law 25 s. 8.1): anything that tracks a
// visitor is OFF until they say yes, saying no is one tap like saying yes, and the choice
// can be changed any time (footer "Cookie settings"). Essential cookies (sign-in, delivery
// area, referral code) need no consent and always run. The only non-essential tracker is
// Google Analytics, so it is not even loaded until analytics is accepted.

const COOKIE = "tg_consent";
const VERSION = 1;
// Ask again after 12 months, or when VERSION changes (new kinds of cookies).
const MAX_AGE = 60 * 60 * 24 * 365;
const OPEN_EVENT = "tg:consent-open";

type Consent = { v: number; analytics: boolean; at: number };

function readConsent(): Consent | null {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  try {
    const c = JSON.parse(decodeURIComponent(raw)) as Consent;
    return c.v === VERSION ? c : null;
  } catch {
    return null;
  }
}

function writeConsent(analytics: boolean): Consent {
  const c: Consent = { v: VERSION, analytics, at: Date.now() };
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(c))}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax${secure}`;
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
  w.gtag?.("consent", "update", { analytics_storage: "denied" });
  const host = location.hostname.split(".").slice(-2).join(".");
  for (const c of document.cookie.split("; ")) {
    const name = c.split("=")[0];
    if (name && /^_ga/.test(name)) {
      for (const domain of ["", `; Domain=.${host}`]) document.cookie = `${name}=; Max-Age=0; Path=/${domain}`;
    }
  }
}

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const c = readConsent();
    if (c) {
      setAnalytics(c.analytics);
      if (c.analytics) loadAnalytics();
    } else {
      setOpen(true);
    }
    const reopen = () => {
      setAnalytics(readConsent()?.analytics ?? false);
      setDetails(true);
      setReopened(true);
      setOpen(true);
    };
    addEventListener(OPEN_EVENT, reopen);
    return () => removeEventListener(OPEN_EVENT, reopen);
  }, []);

  const decide = (yes: boolean) => {
    const before = readConsent()?.analytics ?? false;
    writeConsent(yes);
    if (yes) loadAnalytics();
    else if (before) stopAnalytics();
    setAnalytics(yes);
    setOpen(false);
    setDetails(false);
  };

  if (!open) return null;

  return (
    <section className="tg-consent" role="region" aria-label="Cookie choices" data-reopened={reopened || undefined}>
      <div className="tg-consent__body">
        <h2 className="tg-consent__title">Cookies on Tiffin Grab</h2>
        <p className="tg-consent__text">
          We use essential cookies to keep you signed in and remember your delivery area. With your OK, we also use
          Google Analytics to see which pages help people find their tiffin.{" "}
          <Link href="/privacy#s8">Privacy policy</Link>
        </p>
        {details ? (
          <ul className="tg-consent__list">
            <li>
              <div>
                <strong>Essential</strong>
                <span>Sign-in, delivery area, checkout and referral codes. The site needs these to work.</span>
              </div>
              <span className="tg-consent__always">Always on</span>
            </li>
            <li>
              <label htmlFor="tg-consent-analytics">
                <strong>Analytics</strong>
                <span>Google Analytics: pages visited and how long, counted without your name.</span>
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
      </div>
      <div className="tg-consent__actions">
        {details ? (
          <button type="button" className="tg-consent__btn tg-consent__btn--primary" onClick={() => decide(analytics)}>Save choices</button>
        ) : (
          <button type="button" className="tg-consent__btn tg-consent__btn--ghost" onClick={() => setDetails(true)}>Choose</button>
        )}
        <button type="button" className="tg-consent__btn" onClick={() => decide(false)}>Essential only</button>
        <button type="button" className="tg-consent__btn" onClick={() => decide(true)}>Accept all</button>
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
