"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { BrandMark, BrandWordmark } from "@/components/brand-logo";
import { useSession } from "@/lib/auth/client";
import { roleLanding } from "@/lib/auth/landing";
import { Role, type RoleValue } from "@foundry/commons";
import "./nav.css";

const LINKS = [
  { href: "/menu/weekly", label: "Menu" },
  { href: "/plans", label: "Plans" },
  { href: "/pricing", label: "Pricing" },
];

/** Label that rolls up on hover: the visible copy slides out as an aria-hidden twin rolls in. */
function Roll({ children, className }: { children: string; className?: string }) {
  return (
    <span className={className ? `tg-roll ${className}` : "tg-roll"}>
      <span>{children}</span>
      <span aria-hidden>{children}</span>
    </span>
  );
}

// A floating capsule of liquid glass. It reads what is under it: over the hero video and the
// dark-green bands it turns to smoked glass with cream type, over cream it is frosted cream.
// A single lens slides between the links (hover, focus, else the current page), always from
// where it is, so a quick sweep across the links reads as one object moving. Reading down,
// the capsule tucks away; any scroll up or focus brings it back. On phones the links fold
// into a sheet that grows out of the menu button.
/** `rating` is a server-rendered slot (NavRating): the header itself stays a client component. */
export function LandingHeader({ rating }: { rating?: ReactNode }) {
  const { data: session, refetch } = useSession();
  // Back from app.tiffingrab.ca restores this page from the bfcache with the session it had
  // before sign-in; ask again so the header shows the account, not "Sign in".
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) void refetch(); };
    addEventListener("pageshow", onShow);
    return () => removeEventListener("pageshow", onShow);
  }, [refetch]);
  const role = (session?.user as { role?: RoleValue } | undefined)?.role;
  const account = session?.user
    ? { href: roleLanding(role ?? Role.USER), label: session.user.name?.split(" ")[0] ?? "Account" }
    : { href: "/login", label: "Sign in" };
  const path = usePathname();
  const isCurrent = (href: string) => path === href || path.startsWith(`${href}/`);
  const [open, setOpen] = useState(false);
  const [tucked, setTucked] = useState(false);
  // null until the observer reports: nav.css then picks the first-paint tone from the page
  // itself, so a phone that hydrates late never shows a cream bar over the dark hero.
  const [tone, setTone] = useState<"light" | "dark" | null>(null);
  const barRef = useRef<HTMLElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLAnchorElement>(null);
  const close = () => setOpen(false);

  // Lens: rests on the current page link, follows hover and keyboard focus.
  const moveLens = (target: HTMLElement | null) => {
    const box = linksRef.current;
    if (!box) return;
    const el = target ?? box.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el) { box.style.setProperty("--lens-o", "0"); return; }
    box.style.setProperty("--lens-x", `${el.offsetLeft}px`);
    box.style.setProperty("--lens-w", `${el.offsetWidth}px`);
    box.style.setProperty("--lens-o", "1");
  };
  useLayoutEffect(() => { moveLens(null); }, [path, account.label]);

  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      menuRef.current?.focus();
    };
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

  // Tuck while reading down, return on any scroll up.
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

  // Tone: dark while any .dark band (hero, green sections) sits under the capsule. The
  // observer's root is a thin strip where the capsule floats, so no scroll math is needed.
  useEffect(() => {
    const bands = [...document.querySelectorAll<HTMLElement>(".tg-land main .dark")];
    if (bands.length === 0) return;
    const under = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) e.isIntersecting ? under.add(e.target) : under.delete(e.target);
      setTone(under.size > 0 ? "dark" : "light");
    }, { rootMargin: "-4% 0px -95% 0px" });
    bands.forEach((b) => io.observe(b));
    return () => io.disconnect();
  }, [path]);

  // Specular sheen follows a fine pointer across the glass.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || !matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = bar.getBoundingClientRect();
        bar.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      });
    };
    bar.addEventListener("pointermove", onMove);
    return () => { bar.removeEventListener("pointermove", onMove); cancelAnimationFrame(frame); };
  }, []);

  const navLinks = [...LINKS, account];

  return (
    <>
      <a href="#main" className="tg-skip">Skip to content</a>
      {open ? <div className="tg-bar-scrim" aria-hidden onClick={close} /> : null}
      <header ref={barRef} className="tg-bar" data-tone={open ? "light" : tone ?? undefined} data-open={open} data-tucked={tucked && !open} style={{ viewTransitionName: "site-header" }}>
        <div className="tg-bar__in">
          <Link href="/" className="tg-bar__brand" aria-label="TiffinGrab home" onClick={close}>
            <BrandMark className="tg-bar__mark" />
            <BrandWordmark className="tg-bar__word" grabClassName="tg-bar__grab" />
          </Link>
          <div ref={linksRef} className="tg-bar__links" onPointerLeave={() => moveLens(null)} onBlur={() => moveLens(null)}>
            <span className="tg-bar__lens" aria-hidden />
            <nav aria-label="Main" className="contents">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  prefetch={l === account ? false : undefined}
                  className="tg-bar__link"
                  aria-current={isCurrent(l.href) ? "page" : undefined}
                  onPointerEnter={(e) => moveLens(e.currentTarget)}
                  onFocus={(e) => moveLens(e.currentTarget)}
                >
                  <Roll>{l.label}</Roll>
                </Link>
              ))}
            </nav>
          </div>
          <div className="tg-bar__end">
            {rating}
            <Link prefetch={false} href="/subscribe" className="tg-cta tg-bar__cta" tabIndex={open ? -1 : undefined}>
              <Roll className="tg-bar__cta-long">Build my tiffin</Roll>
              <Roll className="tg-bar__cta-short">Order</Roll>
              <ArrowRight aria-hidden className="tg-bar__arrow size-4" strokeWidth={2.4} />
            </Link>
            <button ref={menuRef} type="button" className="tg-bar__menu" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="tg-sheet" onClick={() => setOpen((v) => !v)}>
              <span className="tg-burger" aria-hidden><span /><span /></span>
            </button>
          </div>
        </div>
        <div id="tg-sheet" className="tg-sheet" inert={!open}>
          <nav aria-label="Menu" className="tg-sheet__links">
            {navLinks.map((l, i) => (
              <Link key={l.href} ref={i === 0 ? firstRef : undefined} href={l.href} prefetch={l === account ? false : undefined} className="tg-sheet__link" aria-current={isCurrent(l.href) ? "page" : undefined} style={{ "--i": i } as CSSProperties} onClick={close}>
                {l.label}
                <ArrowUpRight aria-hidden className="size-6" strokeWidth={2} />
              </Link>
            ))}
          </nav>
          <Link prefetch={false} href="/subscribe" className="tg-cta tg-sheet__cta" onClick={close}>Build my tiffin</Link>
          <div className="tg-sheet__foot">
            <Link href="/contact" onClick={close}>Contact</Link>
            <Link href="/faq" onClick={close}>FAQ</Link>
            <Link href="/locations" onClick={close}>Where we deliver</Link>
          </div>
        </div>
      </header>
    </>
  );
}
