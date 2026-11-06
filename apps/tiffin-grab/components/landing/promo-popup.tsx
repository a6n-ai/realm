"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { PROMO_POPUP_SEEN_KEY, type LandingPromo } from "@/lib/landing/promo-types";
import { usePublicSession } from "@/lib/auth/public-session";
import { SavingsReceipt } from "@/components/landing/promo/savings-receipt";
import "@/components/landing/promo/promo.css";

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure origin, permissions): the code stays visible to type.
    }
  };
  return (
    <button type="button" className="tg-code" onClick={copy} aria-label={`Copy code ${code}`}>
      <span className="tg-code__value">{code}</span>
      {copied ? <Check aria-hidden className="size-4" strokeWidth={2} /> : <Copy aria-hidden className="size-4" strokeWidth={1.75} />}
      <span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>
    </button>
  );
}

/** Staff promo HTML (a full email document, sanitized on save) in a sandbox with no scripts.
 *  allow-same-origin only lets this page read the height; nothing inside can run. */
// Saved promo HTML carries a Google Fonts <link> (the old starter). Each frame then re-fetched
// Google's CSS on the critical path; the same latin Poppins files are served from this origin.
const GOOGLE_POPPINS = /<link[^>]+fonts\.googleapis\.com\/css2\?family=Poppins[^>]*>/gi;
const FRAME_FONTS = `<style>${[400, 700, 800].map((w) => `@font-face{font-family:Poppins;font-style:normal;font-weight:${w};font-display:swap;src:url(/landing/fonts/poppins-${w}.woff2) format("woff2")}`).join("")}</style>`;

export function PromoHtml({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  // Measure the content itself, not documentElement.scrollHeight: that never reports less than
  // the frame's own height, and iOS Safari can still return the old (tall) value right after a
  // collapse to 0px, leaving a gap under the text that pushed the Claim button off a phone.
  const fit = () => {
    const frame = ref.current;
    const doc = frame?.contentDocument;
    const body = doc?.body;
    // A closed dialog lays the frame out at width 0, where the text wraps a letter per line;
    // measure once it has a width (the width observer below calls again on open).
    if (!frame || !doc || !body || frame.clientWidth === 0) return;
    const range = doc.createRange();
    range.selectNodeContents(body);
    const cs = doc.defaultView?.getComputedStyle(body);
    const tail = cs ? parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.marginBottom) : 0;
    const h = Math.ceil(range.getBoundingClientRect().bottom + (doc.defaultView?.scrollY ?? 0) + tail);
    // Only write a real change: each write resizes the frame, which wakes the observers.
    if (h > 0 && Math.abs(h - frame.offsetHeight) >= 1) frame.style.height = `${h}px`;
  };
  // Observers call through the next frame, never inside their own callback: resizing there
  // re-triggered them in the same frame (WebKit: "ResizeObserver loop completed with
  // undelivered notifications"), the loop that crashed iPhone Safari when the popup opened.
  const raf = useRef(0);
  const scheduleFit = () => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(fit); };
  // The frame's content also resizes by itself: a font swap after fonts.ready already resolved
  // (a closed dialog lays out at width 0 and clipped the last line), or an image in staff HTML.
  // Observed per load: srcdoc replaces the document, and with it the body.
  const inner = useRef<ResizeObserver | null>(null);
  const onLoad = () => {
    fit();
    const body = ref.current?.contentDocument?.body;
    inner.current?.disconnect();
    if (body) { inner.current = new ResizeObserver(scheduleFit); inner.current.observe(body); }
    // Web fonts land after load and change the text height.
    ref.current?.contentDocument?.fonts?.ready.then(scheduleFit).catch(() => {});
  };
  // Width changes (carousel resize, phone rotation) rewrap the text.
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    // Server-rendered frames can finish loading before hydration attaches onLoad, which then never fires.
    if (frame.contentDocument?.readyState === "complete") onLoad();
    let width = frame.clientWidth;
    const ro = new ResizeObserver(() => {
      if (frame.clientWidth !== width) { width = frame.clientWidth; scheduleFit(); }
    });
    ro.observe(frame);
    return () => { ro.disconnect(); inner.current?.disconnect(); cancelAnimationFrame(raf.current); };
  }, []);
  return (
    <iframe
      ref={ref}
      className="lp-promo-frame"
      title={title}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={`<base target="_blank">${FRAME_FONTS}${html.replace(GOOGLE_POPPINS, "")}`}
      onLoad={onLoad}
    />
  );
}

const seen = (id: string) => {
  try { return localStorage.getItem(PROMO_POPUP_SEEN_KEY) === id; } catch { return true; }
};
const markSeen = (id: string) => {
  try { localStorage.setItem(PROMO_POPUP_SEEN_KEY, id); } catch { /* private mode: it may show again */ }
};

// Signed-in customers: once per browser session (a new visit shows it again).
const SESSION_KEY = "tg.promo.popup.session";
const seenThisSession = (id: string) => {
  try { return sessionStorage.getItem(SESSION_KEY) === id; } catch { return true; }
};
const markSession = (id: string) => {
  try { sessionStorage.setItem(SESSION_KEY, id); } catch { /* storage blocked: it may show again */ }
};

/** The running offer as a popup.
 *  - Signed in: opens 3 s after load on any device, once per browser session, unless the
 *    visitor taps, types or scrolls first.
 *  - Signed out: exit intent only (a mouse leaving through the top edge after a few seconds),
 *    never on a timer, once per promo; touch screens rely on the hero ticket and carousel. */
export function PromoPopup({ promo, fallbackImage }: { promo: LandingPromo; fallbackImage?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { data: session, isPending } = usePublicSession();
  const signedIn = !!session?.user;

  useEffect(() => {
    if (isPending || !signedIn || seenThisSession(promo.id)) return;
    const t = setTimeout(() => {
      const d = ref.current;
      if (!d || d.open || seenThisSession(promo.id)) return;
      markSession(promo.id);
      d.showModal();
    }, 3000);
    // Someone already tapping, typing or scrolling has somewhere to be: never interrupt them
    // (and never land on top of the cross-host splash a tap just raised).
    const cancel = () => clearTimeout(t);
    const events = ["pointerdown", "keydown", "scroll", "pagehide"] as const;
    events.forEach((ev) => addEventListener(ev, cancel, { once: true, passive: true, capture: true }));
    return () => { clearTimeout(t); events.forEach((ev) => removeEventListener(ev, cancel, { capture: true })); };
  }, [isPending, signedIn, promo.id]);

  useEffect(() => {
    if (isPending || signedIn || seen(promo.id)) return;
    if (!matchMedia("(pointer: fine)").matches) return;
    let armed = false;
    const arm = setTimeout(() => { armed = true; }, 4000);
    const onLeave = (e: MouseEvent) => {
      const d = ref.current;
      if (!armed || e.relatedTarget || e.clientY > 0 || !d || d.open || seen(promo.id)) return;
      markSeen(promo.id);
      d.showModal();
    };
    document.addEventListener("mouseout", onLeave);
    return () => { clearTimeout(arm); document.removeEventListener("mouseout", onLeave); };
  }, [isPending, signedIn, promo.id]);

  const close = () => ref.current?.close();

  return (
    <dialog ref={ref} className="tg-popup" aria-labelledby="tg-popup-title" onClick={(e) => e.target === e.currentTarget && close()}>
      <PromoPanel promo={promo} fallbackImage={fallbackImage} onClose={close} />
    </dialog>
  );
}

/** The popup's content. The landing page wraps it in a <dialog>; the admin preview shows it inline. */
export function PromoPanel({ promo, fallbackImage, onClose, className }: { promo: LandingPromo; fallbackImage?: string; onClose?: () => void; className?: string }) {
  const image = promo.imageUrl || fallbackImage;
  return (
    <div className={className ? `tg-popup__panel ${className}` : "tg-popup__panel"}>
      <button type="button" className="tg-popup__close" aria-label="Close offer" onClick={onClose}>
        <X className="size-5" strokeWidth={1.75} />
      </button>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- staff-supplied URL from any host
        <img className="tg-popup__img" src={image} alt="" width={1040} height={585} loading="lazy" />
      ) : null}
      <div className="tg-popup__body">
        <span className="tg-popup__eyebrow">Offer running now</span>
        {/* The dialog is labelled by the title, so it stays for screen readers when staff HTML replaces it. */}
        {promo.savings ? (
          <>
            <h2 id="tg-popup-title" className="tg-popup__title">{promo.savings.headline} <span className="tg-popup__cond">{promo.savings.condition}</span></h2>
            {promo.blurb ? <p className="tg-popup__blurb">{promo.blurb}</p> : null}
            <SavingsReceipt savings={promo.savings} className="tg-receipt--flat" />
          </>
        ) : (
          <>
            <h2 id="tg-popup-title" className={promo.html ? "sr-only" : "tg-popup__title"}>{promo.title}</h2>
            {promo.html ? <PromoHtml html={promo.html} title={promo.title} /> : promo.blurb ? <p className="tg-popup__blurb">{promo.blurb}</p> : null}
          </>
        )}
        <div className="tg-popup__actions">
          <Link prefetch={false} href={promo.href} className="tg-promo-cta" onClick={onClose}>{promo.cta}</Link>
          {promo.code ? <CopyCode code={promo.code} /> : null}
        </div>
      </div>
    </div>
  );
}
