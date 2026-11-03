"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { PROMO_POPUP_SEEN_KEY, type LandingPromo } from "@/lib/landing/promo-types";
import { useSession } from "@/lib/auth/client";
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
export function PromoHtml({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const fit = () => {
    const doc = ref.current?.contentDocument;
    if (ref.current && doc?.documentElement) ref.current.style.height = `${doc.documentElement.scrollHeight}px`;
  };
  return (
    <iframe
      ref={ref}
      className="lp-promo-frame"
      title={title}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={`<base target="_blank">${html}`}
      onLoad={fit}
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
 *  - Signed in: opens 3 s after load on any device, once per browser session.
 *  - Signed out: exit intent only (a mouse leaving through the top edge after a few seconds),
 *    never on a timer, once per promo; touch screens rely on the hero ticket and carousel. */
export function PromoPopup({ promo, fallbackImage }: { promo: LandingPromo; fallbackImage?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { data: session, isPending } = useSession();
  const signedIn = !!session?.user;

  useEffect(() => {
    if (isPending || !signedIn || seenThisSession(promo.id)) return;
    const t = setTimeout(() => {
      const d = ref.current;
      if (!d || d.open || seenThisSession(promo.id)) return;
      markSession(promo.id);
      d.showModal();
    }, 3000);
    return () => clearTimeout(t);
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
        <h2 id="tg-popup-title" className={promo.html ? "sr-only" : "tg-popup__title"}>{promo.title}</h2>
        {promo.html ? <PromoHtml html={promo.html} title={promo.title} /> : promo.blurb ? <p className="tg-popup__blurb">{promo.blurb}</p> : null}
        <div className="tg-popup__actions">
          <Link prefetch={false} href={promo.href} className="tg-promo-cta" onClick={onClose}>{promo.cta}</Link>
          {promo.code ? <CopyCode code={promo.code} /> : null}
        </div>
      </div>
    </div>
  );
}
