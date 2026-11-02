"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { BrandMark, BrandWordmark } from "@/components/brand-logo";
import { useSession } from "@/lib/auth/client";
import { roleLanding } from "@/lib/auth/landing";
import { Role, type RoleValue } from "@foundry/commons";

const LINKS = [
  { href: "/menu/weekly", label: "Menu" },
  { href: "/plans", label: "Plans" },
  { href: "/pricing", label: "Pricing" },
];

/** Label that rolls up on hover: the visible copy slides out as an aria-hidden twin rolls in. */
function Roll({ children }: { children: string }) {
  return (
    <span className="tg-roll">
      <span>{children}</span>
      <span aria-hidden>{children}</span>
    </span>
  );
}

// The customer top bar's anatomy: brand left, nav pills, one hero action. On phones the
// pills fold into a panel that drops out of the glass pill (a disclosure, not a modal).
// The bar tucks away while reading down the page and returns on any scroll up.
/** `rating` is a server-rendered slot (NavRating): the header itself stays a client component. */
export function LandingHeader({ rating }: { rating?: ReactNode }) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: RoleValue } | undefined)?.role;
  const account = session?.user
    ? { href: roleLanding(role ?? Role.USER), label: session.user.name?.split(" ")[0] ?? "Account" }
    : { href: "/login", label: "Sign in" };
  const path = usePathname();
  const current = (href: string) => (path === href || path.startsWith(`${href}/`) ? "page" : undefined);
  const [open, setOpen] = useState(false);
  const [tucked, setTucked] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLAnchorElement>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      menuRef.current?.focus();
    };
    // Phones only (the button is hidden wider): close if the viewport grows past the breakpoint.
    const wide = matchMedia("(min-width: 821px)");
    const onWide = () => wide.matches && setOpen(false);
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      html.style.overflow = prev;
      removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  useEffect(() => {
    let last = scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = scrollY;
        if (Math.abs(y - last) < 8) return;
        setTucked(y > last && y > 240);
        last = y;
      });
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => { removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);

  return (
    <>
      <a href="#main" className="tg-skip">Skip to content</a>
      {open ? <div className="tg-drawer-scrim" aria-hidden onClick={close} /> : null}
      <header className="tg-header c-glass" data-open={open} data-tucked={tucked && !open} style={{ viewTransitionName: "site-header" }}>
        <div className="tg-wrap tg-header__in">
          <Link href="/" className="tg-header__brand" aria-label="TiffinGrab home" onClick={close}>
            <BrandMark className="size-9" />
            <BrandWordmark className="tg-header__word text-lg" grabClassName="text-[#185936]" />
          </Link>
          <nav className="tg-nav" aria-label="Main">
            {LINKS.map((l) => <Link key={l.href} href={l.href} className="tg-navpill" aria-current={current(l.href)}><Roll>{l.label}</Roll></Link>)}
            <Link prefetch={false} href={account.href} className="tg-navpill" aria-current={current(account.href)}><Roll>{account.label}</Roll></Link>
            {rating}
            <Link prefetch={false} href="/subscribe" className="tg-cta tg-header__cta ml-1" tabIndex={open ? -1 : undefined}>
              <Roll>Build my tiffin</Roll>
              <ArrowRight aria-hidden className="tg-header__arrow size-4" strokeWidth={2.4} />
            </Link>
            <button ref={menuRef} type="button" className="tg-menu-btn" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="tg-drawer" onClick={() => setOpen((v) => !v)}>
              <span className="tg-burger" aria-hidden><span /><span /></span>
            </button>
          </nav>
        </div>
        <div id="tg-drawer" className="tg-drawer" inert={!open}>
          <nav aria-label="Menu" className="tg-drawer__links">
            {[...LINKS, account].map((l, i) => (
              <Link key={l.href} ref={i === 0 ? firstRef : undefined} href={l.href} prefetch={l === account ? false : undefined} className="tg-drawer__link" aria-current={current(l.href)} style={{ "--i": i } as CSSProperties} onClick={close}>
                {l.label}
                <ArrowUpRight aria-hidden className="size-6" strokeWidth={2} />
              </Link>
            ))}
          </nav>
          <Link prefetch={false} href="/subscribe" className="tg-cta tg-drawer__cta" onClick={close}>Build my tiffin</Link>
          <p className="tg-drawer__note">Home-style Indian tiffins, delivered across the GTA.</p>
        </div>
      </header>
    </>
  );
}
