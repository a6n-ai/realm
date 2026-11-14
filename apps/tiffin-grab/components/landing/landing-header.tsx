"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { BrandMark, BrandWordmark } from "@/components/brand-logo";
import { usePublicSession } from "@/lib/auth/public-session";
import { roleLanding } from "@/lib/auth/landing";
import { Role, type RoleValue } from "@foundry/commons";
import { pageOf } from "@/lib/routing/public-pages";

const navLink = (path: string) => ({ href: path, label: pageOf(path).label });
const LINKS = ["/menu", "/pricing", "/locations"].map(navLink);

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
/** `refer` adds Refer to the header links and the menu sheet. Build my tiffin lives in the floating bar (ActionPill), not here. */
export function LandingHeader({ rating, refer = false }: { rating?: ReactNode; refer?: boolean }) {
  const { data: session, refetch } = usePublicSession();
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
  // Signed in: the order button goes home (running plan, renewals), not to a fresh order.
  const orderHref = session?.user ? account.href : "/subscribe";
  const path = usePathname();
  const isCurrent = (href: string) => path === href || path.startsWith(`${href}/`);
  const [open, setOpen] = useState(false);
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
    // The lens spans the whole row and is clipped to the link, so it slides without animating layout.
    box.style.setProperty("--lens-l", `${el.offsetLeft}px`);
    box.style.setProperty("--lens-r", `${box.clientWidth - el.offsetLeft - el.offsetWidth}px`);
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


  // Tone: dark while any .dark band (hero, green sections) sits under the capsule. The
  // observer's root is a thin strip where the capsule floats, so no scroll math is needed.
  useEffect(() => {
    const bands = [...document.querySelectorAll<HTMLElement>(".tg-land main .dark")];
    // A page with no dark band resets to light: the previous page's tone otherwise sticks (Back from home).
    if (bands.length === 0) { setTone(null); return; }
    const under = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) e.isIntersecting ? under.add(e.target) : under.delete(e.target);
      setTone(under.size > 0 ? "dark" : "light");
    }, { rootMargin: "-4% 0px -95% 0px" });
    bands.forEach((b) => io.observe(b));
    return () => io.disconnect();
  }, [path]);

  // Refer sits in the menu on every width while the referral programme runs.
  const navLinks = refer ? [...LINKS, navLink("/refer"), account] : [...LINKS, account];
  const sheetLinks = refer ? [...LINKS, { href: "/refer", label: "Refer a friend" }, account] : navLinks;

  return (
    <>
      <a href="#main" className="tg-skip">Skip to content</a>
      {open ? <div className="tg-bar-scrim" aria-hidden onClick={close} /> : null}
      <header ref={barRef} className="tg-bar" data-tone={open ? "light" : tone ?? undefined} data-open={open} style={{ viewTransitionName: "site-header" }}>
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
            <button ref={menuRef} type="button" className="tg-bar__menu" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="tg-sheet" onClick={() => setOpen((v) => !v)}>
              <span className="tg-burger" aria-hidden><span /><span /></span>
            </button>
          </div>
        </div>
        <div id="tg-sheet" className="tg-sheet" inert={!open}>
          <nav aria-label="Menu" className="tg-sheet__links">
            {sheetLinks.map((l, i) => (
              <Link key={l.href} ref={i === 0 ? firstRef : undefined} href={l.href} prefetch={l === account ? false : undefined} className="tg-sheet__link" aria-current={isCurrent(l.href) ? "page" : undefined} style={{ "--i": i } as CSSProperties} onClick={close}>
                {l.label}
                <ArrowUpRight aria-hidden className="size-6" strokeWidth={2} />
              </Link>
            ))}
          </nav>
          <Link prefetch={false} href={orderHref} className="tg-cta tg-sheet__cta" onClick={close}>Build my tiffin</Link>
          <div className="tg-sheet__foot">
            <Link href="/contact" onClick={close}>{pageOf("/contact").label}</Link>
            <Link href="/faq" onClick={close}>{pageOf("/faq").label}</Link>
          </div>
        </div>
      </header>
    </>
  );
}
