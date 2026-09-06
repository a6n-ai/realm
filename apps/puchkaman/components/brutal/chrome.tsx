"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@foundry/themes";
import { NavCartButton } from "@/components/cart/nav-cart-button";
import { useCart } from "@/components/cart/cart-provider";
import { IconBike, IconUser } from "./icons";
import { Btn } from "./shared";
import { LOCATIONS, PHONE_DISPLAY } from "@/lib/links";

/* [route-name, long label, short label] */
export const NAV_LINKS: [string, string, string][] = [
  ["home", "Home", "Home"],
  ["eats", "Menu", "Menu"],
  ["fusion", "Fusion Puchkas", "Fusion"],
  ["catering", "Catering", "Catering"],
  ["about", "About", "About"],
  ["contact", "Contact", "Contact"],
];

const hrefFor = (p: string) => (p === "home" ? "/" : `/${p}`);

function usePageName() {
  const pathname = usePathname();
  return pathname === "/" ? "home" : pathname.split("/")[1];
}

function MobileCartLink() {
  const { orderingEnabled } = useCart();
  if (!orderingEnabled) return null;
  return (
    <Btn page="cart" variant="cream" size="lg" block>
      Cart
    </Btn>
  );
}

/* ---------- Theme toggle (sun / moon) ---------- */
/** Public marketing toggle — shares @foundry/themes preference with admin auth/CRM. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="theme-toggle"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      <svg
        className="icon-sun"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2.2M12 19.8V22M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2 12h2.2M19.8 12H22M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
      </svg>
      <svg className="icon-moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a.7.7 0 0 0-.95-.78A10 10 0 1 0 21.28 15.45a.7.7 0 0 0-.78-.95z" />
      </svg>
    </button>
  );
}

/* ---------- Logo ---------- */
/** Circular brand mark with brutalist 3D bevel (mirrors .btn--sm).
 *  Colors live in `.logo-mark` CSS: red accents on yellow/cream
 *  surfaces (no yellow-on-yellow); yellow accents inside `.surface-ink`. */
function Logo({
  size = 50,
  wordmarkColor = "var(--green)",
  // clamp() so this stays pixel-identical to the old fixed 1.35rem from
  // ~480px up (i.e. everywhere it used to render) but scales down on very
  // narrow phones — at 320px this was overflowing past the header icons.
  wordmarkSize = "clamp(0.85rem, 4.5vw, 1.35rem)",
  priority = false,
}: {
  size?: number;
  wordmarkColor?: string;
  wordmarkSize?: string;
  priority?: boolean;
} = {}) {
  return (
    <Link href="/" aria-label="Puchkaman home" className="header-logo" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <span className="logo-mark" style={{ width: size, height: size }}>
        <Image
          src="/logo.webp"
          alt=""
          width={size}
          height={size}
          priority={priority}
          className="logo-mark__img"
        />
      </span>
      <span className="display" style={{ fontSize: wordmarkSize, letterSpacing: "-0.04em", color: wordmarkColor, whiteSpace: "nowrap" }}>
        PUCHKAMAN
      </span>
    </Link>
  );
}

/* ---------- Nav ---------- */
export function Nav() {
  const current = usePageName();
  // Remember which page the drawer was opened on. Navigating changes `current`, so
  // the drawer closes on its own — no route-watching effect to reset it.
  const [openForPage, setOpenForPage] = useState<string | null>(null);
  const open = openForPage === current;
  const setOpen = (next: boolean) => setOpenForPage(next ? current : null);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ background: "var(--page-bg)", borderBottom: "var(--border)" }}>
        <div className="wrap header-bar flex center between" style={{ height: "var(--header-h)" }}>
          <Logo priority />
          <nav className="nav-desk" style={{ display: "none", alignItems: "center", gap: 2 }}>
            {NAV_LINKS.map(([p, label, short]) => (
              <Link
                key={p}
                href={hrefFor(p)}
                className="nav-link"
                style={{
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  padding: "8px 11px",
                  borderRadius: 8,
                  whiteSpace: "nowrap",
                  lineHeight: 1,
                  border: current === p ? "2.5px solid var(--ink)" : "2.5px solid transparent",
                  background: current === p ? "var(--white)" : "transparent",
                  boxShadow: current === p ? "3px 3px 0 var(--ink)" : "none",
                }}
              >
                {short || label}
              </Link>
            ))}
          </nav>
          <div className="flex center header-icons" style={{ gap: 8 }}>
            <ThemeToggle />
            {/* Always points at /account — that page redirects a signed-in
                visitor to their own area, so the header needs no session read
                (and no per-page /get-session fetch on the public site). */}
            <Btn href="/account" variant="cream" size="sm" aria-label="Your account">
              <IconUser />
            </Btn>
            <NavCartButton />
            <Btn page="order" variant="green" size="sm" className="nav-order">
              <IconBike />
              Order Now
            </Btn>
            <button
              type="button"
              className="burger"
              onClick={() => setOpen(!open)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              style={{
                display: "grid",
                placeItems: "center",
                width: 44,
                height: 44,
                border: "var(--border)",
                borderRadius: 10,
                background: "var(--white)",
                boxShadow: "3px 3px 0 var(--ink)",
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1 }} aria-hidden="true">
                {open ? "✕" : "☰"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Stays mounted so it can animate both ways — the same pattern the cart
          drawer uses. `inert` while closed keeps it out of the tab order and
          off the accessibility tree, which a conditional render did for free. */}
      <div className="nav-drawer" data-open={open || undefined} inert={!open || undefined}>
        <div className="wrap" style={{ padding: "22px 20px 40px", display: "grid", gap: 12 }}>
          {NAV_LINKS.map(([p, label]) => (
            <Link
              key={p}
              href={hrefFor(p)}
              className="card"
              style={{
                padding: "16px 18px",
                fontSize: "1.3rem",
                fontWeight: 800,
                background: current === p ? "var(--ink)" : "var(--white)",
                color: current === p ? "var(--yellow)" : "var(--ink)",
                textTransform: "uppercase",
                letterSpacing: "-0.02em",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              {label} <span style={{ opacity: 0.5 }}>→</span>
            </Link>
          ))}
          <Btn page="eats" variant="yellow" size="lg" block style={{ marginTop: 8 }}>
            Browse menu
          </Btn>
          <MobileCartLink />
          <Btn href="/account" variant="white" size="lg" block>
            Sign in / My account
          </Btn>
          <Btn page="order" variant="green" size="lg" block>
            <IconBike />
            Order Now
          </Btn>
        </div>
      </div>
    </header>
  );
}

/* ---------- Footer ---------- */
const TIK_BARS = [3, 1, 4, 2, 1, 5, 2, 3, 1, 2, 4, 1, 3, 5, 1, 2, 3, 1, 4, 2, 5, 1, 3, 2, 1, 4, 2, 3, 1, 5, 2, 1, 3, 4, 1, 2];

export function Footer() {
  return (
    <footer className="surface-ink" style={{ background: "var(--ink)", borderTop: "var(--border)", padding: "clamp(36px,6vw,64px) 20px" }}>
      <div className="tik">
        <div className="tik-route">
          <div>
            <p className="tik-sub">From</p>
            <p className="display" style={{ fontSize: "clamp(2rem,6vw,3.4rem)", lineHeight: 1 }}>KOL</p>
            <p className="tik-sub">Kolkata</p>
          </div>
          <div className="tik-dots" aria-hidden="true">
            <i />
            <b>💧</b>
            <i />
          </div>
          <div style={{ textAlign: "right" }}>
            <p className="tik-sub">To</p>
            <p className="display" style={{ fontSize: "clamp(2rem,6vw,3.4rem)", lineHeight: 1, color: "var(--green)" }}>CAN</p>
            <p className="tik-sub">Canada</p>
          </div>
        </div>

        <div className="tik-body">
          <div className="tik-col">
            <div style={{ marginBottom: 12 }}>
              <Logo size={32} wordmarkColor="var(--ink)" wordmarkSize="1.35rem" />
            </div>
            <p style={{ fontWeight: 500, lineHeight: 1.5, maxWidth: 300, opacity: 0.85 }}>
              Toronto&apos;s first fusion puchka spot. Kolkata street food, reimagined in Scarborough — crunching across Canada.
            </p>
            <p className="tik-stamp">★ Franchise Approved ★</p>
            <div className="flex wrap-gap" style={{ marginTop: 18 }}>
              <Btn page="order" variant="green" size="sm">
                Order Now
              </Btn>
              <Btn page="catering" variant="yellow" size="sm">
                Book Catering
              </Btn>
            </div>
          </div>

          <div className="tik-col">
            <h4 className="tik-h">Explore</h4>
            {NAV_LINKS.concat([
              ["order", "Order Online", "Order"],
              ["reviews", "Reviews", "Reviews"],
            ]).map(([p, label]) => (
              <Link key={p} href={hrefFor(p)} className="tik-line">
                {label}
                <i />
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>

          <div className="tik-col">
            <h4 className="tik-h">Find Us</h4>
            {LOCATIONS.map((loc) => (
              <p key={loc.city} className="tik-line" style={{ alignItems: "flex-start" }}>
                {loc.city}
                <i />
                <span style={{ textAlign: "right", fontWeight: 500 }}>
                  {loc.addressLines[0]}
                  <br />
                  {loc.addressLines[1]}
                </span>
              </p>
            ))}
            <p className="tik-line">
              Phone
              <i />
              {PHONE_DISPLAY}
            </p>
            <p className="tik-line">
              Hours
              <i />
              Sun–Thu 3pm–2am
            </p>
            <div className="flex wrap-gap" style={{ marginTop: 14 }}>
              <Link href="/contact" className="pill pill--yellow">
                Instagram ↗
              </Link>
              <Link href="/contact" className="pill" style={{ background: "#25D366", color: "#fff" }}>
                WhatsApp ↗
              </Link>
            </div>
            <div className="tik-barcode" aria-hidden="true">
              {TIK_BARS.map((w, i) => (
                <i key={i} style={{ width: w, marginRight: 3 }} />
              ))}
            </div>
          </div>
        </div>

        <div className="tik-foot">
          <span>© 2026 PUCHKAMAN · Scarborough, ON & Delta, BC</span>
          <div className="flex wrap-gap" style={{ gap: 14 }}>
            <Link href="/faq" className="foot-link" style={{ minHeight: "auto" }}>
              FAQ
            </Link>
            <Link href="/privacy" className="foot-link" style={{ minHeight: "auto" }}>
              Privacy
            </Link>
            <Link href="/terms" className="foot-link" style={{ minHeight: "auto" }}>
              Terms
            </Link>
          </div>
          <span>Pani Puri · Golgappa · Puchka · Gupchup</span>
        </div>
      </div>
    </footer>
  );
}
