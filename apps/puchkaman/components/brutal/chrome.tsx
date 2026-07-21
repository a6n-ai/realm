"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Btn } from "./shared";
import { PHONE_DISPLAY } from "@/lib/links";

/* [route-name, long label, short label] */
export const NAV_LINKS: [string, string, string][] = [
  ["home", "Home", "Home"],
  ["productsmenu", "Menu", "Menu"],
  ["fusion", "Fusion Puchkas", "Fusion"],
  ["catering", "Catering", "Catering"],
  ["events", "Watch Parties", "Events"],
  ["about", "About", "About"],
  ["contact", "Contact", "Contact"],
];

const hrefFor = (p: string) => (p === "home" ? "/" : `/${p}`);

function usePageName() {
  const pathname = usePathname();
  return pathname === "/" ? "home" : pathname.split("/")[1];
}

/* ---------- Theme toggle (sun / moon) ---------- */
export function ThemeToggle() {
  const [theme, setTheme] = useState<string>("light");
  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") || "light");
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("puchkaman-theme", next);
    } catch {
      /* private mode / storage blocked — theme still applies for this session */
    }
  };
  return (
    <button
      onClick={toggle}
      className="theme-toggle"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
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
function Logo() {
  return (
    <Link href="/" aria-label="Puchkaman home" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.webp" alt="" style={{ height: 50, width: "auto", display: "block" }} />
      <span className="display" style={{ fontSize: "1.35rem", letterSpacing: "-0.04em", color: "var(--red)" }}>
        PUCHKAMAN
      </span>
    </Link>
  );
}

/* ---------- Nav ---------- */
export function Nav() {
  const current = usePageName();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [current]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ background: "var(--page-bg)", borderBottom: "var(--border)" }}>
        <div className="wrap flex center between" style={{ height: 70 }}>
          <Logo />
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
          <div className="flex center" style={{ gap: 10 }}>
            <ThemeToggle />
            <Btn page="order" variant="red" size="sm" className="nav-order">
              🛵 Order Now
            </Btn>
            <button
              className="burger"
              onClick={() => setOpen(!open)}
              aria-label="Menu"
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
              <span style={{ fontSize: 20, lineHeight: 1 }}>{open ? "✕" : "☰"}</span>
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: "70px 0 0 0",
            background: "var(--page-bg)",
            zIndex: 49,
            overflowY: "auto",
            borderTop: "var(--border)",
          }}
        >
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
            <Btn page="order" variant="red" size="lg" block style={{ marginTop: 8 }}>
              🛵 Order Now
            </Btn>
          </div>
        </div>
      )}
    </header>
  );
}

/* ---------- Footer ---------- */
export function Footer() {
  return (
    <footer className="surface-ink" style={{ background: "var(--ink)", color: "var(--cream)", borderTop: "var(--border)" }}>
      <div className="wrap" style={{ padding: "54px 20px 30px" }}>
        <div className="footer-grid" style={{ display: "grid", gap: 36 }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "var(--red)",
                  border: "3px solid var(--yellow)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--yellow)" }} />
              </span>
              <span className="display" style={{ fontSize: "1.5rem", color: "var(--yellow)" }}>
                PUCHKAMAN
              </span>
            </div>
            <p style={{ maxWidth: 320, fontWeight: 500, opacity: 0.85, lineHeight: 1.5 }}>
              Toronto&apos;s first fusion puchka spot. Kolkata street food, reimagined in Scarborough.
            </p>
            <div className="flex wrap-gap" style={{ marginTop: 18 }}>
              <Btn page="order" variant="red" size="sm">
                Order Now
              </Btn>
              <Btn page="catering" variant="yellow" size="sm">
                Book Catering
              </Btn>
            </div>
          </div>

          <div>
            <h2 className="kicker" style={{ color: "var(--yellow)", marginBottom: 14 }}>
              Explore
            </h2>
            <div style={{ display: "grid", gap: 10 }}>
              {NAV_LINKS.concat([["order", "Order Online", "Order"]]).map(([p, label]) => (
                <Link key={p} href={hrefFor(p)} style={{ fontWeight: 600, opacity: 0.9 }} className="foot-link">
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h2 className="kicker" style={{ color: "var(--yellow)", marginBottom: 14 }}>
              Visit Us
            </h2>
            <div style={{ display: "grid", gap: 12, fontWeight: 500 }}>
              <p>
                📍 3315 Danforth Ave,
                <br />
                Scarborough, ON
              </p>
              <p>📞 {PHONE_DISPLAY}</p>
              <p>🕑 Tue–Sun · 12pm – 10pm</p>
              <div className="flex wrap-gap" style={{ marginTop: 4 }}>
                <Link href="/contact" className="pill pill--yellow">
                  Instagram ↗
                </Link>
                <Link href="/contact" className="pill" style={{ background: "#25D366", color: "#fff" }}>
                  WhatsApp ↗
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div
          className="flex center between wrap-gap"
          style={{
            marginTop: 44,
            paddingTop: 22,
            borderTop: "2px solid rgba(255,244,218,.2)",
            fontSize: "0.82rem",
            opacity: 0.7,
            fontFamily: "var(--mono)",
          }}
        >
          <span>© 2026 Puchkaman · Scarborough, GTA</span>
          <span>Pani Puri · Golgappa · Puchka · Gupchup</span>
        </div>
      </div>
    </footer>
  );
}
