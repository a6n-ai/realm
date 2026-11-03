"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONSENT_COOKIE, CONSENT_VERSION, parseConsent, type Consent } from "@/lib/consent";
import "./cookie-consent.css";

// Cookie consent for Canadian rules (PIPEDA; Quebec Law 25 s. 8.1): anything that tracks a
// visitor is OFF until they say yes, saying no is one tap like saying yes, and the choice
// can be changed any time (footer "Cookie settings"). Essential cookies (sign-in, delivery
// area, referral code) need no consent and always run. The only non-essential tracker is
// the tracking bootstrap (/api/analytics: Google Analytics and the Meta Pixel), so it is not
// even loaded until the visitor accepts; server-side sends check the same cookie.

// Ask again after 12 months, or when CONSENT_VERSION changes.
const MAX_AGE = 60 * 60 * 24 * 365;
const OPEN_EVENT = "tg:consent-open";

function readConsent(): Consent | null {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`))?.slice(CONSENT_COOKIE.length + 1);
  return parseConsent(raw);
}

function writeConsent(analytics: boolean): Consent {
  const c: Consent = { v: CONSENT_VERSION, analytics, at: Date.now() };
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(c))}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax${secure}`;
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
          Google Analytics and the Meta (Facebook) pixel to see which pages and ads help people find their tiffin.{" "}
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
