"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { BrandMark, BrandWordmark } from "@/components/brand-logo";
import { useSession } from "@/lib/auth/client";
import { roleLanding } from "@/lib/auth/landing";
import { Role, type RoleValue } from "@foundry/commons";

const LINKS = [
  { href: "/menu/weekly", label: "Menu" },
  { href: "/plans", label: "Plans" },
  { href: "/pricing", label: "Pricing" },
];

// The customer top bar's anatomy: brand left, nav pills, one hero action; on
// phones the pills fold into a sheet behind a 44px menu button.
export function LandingHeader() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: RoleValue } | undefined)?.role;
  const account = session?.user
    ? { href: roleLanding(role ?? Role.USER), label: session.user.name?.split(" ")[0] ?? "Account" }
    : { href: "/login", label: "Sign in" };
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", onKey);
    const menu = menuRef.current;
    return () => { removeEventListener("keydown", onKey); menu?.focus(); };
  }, [open]);

  return (
    <>
      <a href="#main" className="tg-skip">Skip to content</a>
      <header className="tg-header c-glass" style={{ viewTransitionName: "site-header" }}>
        <div className="tg-wrap tg-header__in">
          <Link href="/" className="tg-header__brand" aria-label="TiffinGrab home">
            <BrandMark className="size-9" />
            <BrandWordmark className="text-lg" />
          </Link>
          <nav className="tg-nav" aria-label="Main">
            {LINKS.map((l) => <Link key={l.href} href={l.href} className="tg-navpill">{l.label}</Link>)}
            <Link href={account.href} className="tg-navpill">{account.label}</Link>
            <Link href="/subscribe" className="tg-cta ml-1">Build my tiffin</Link>
            <button ref={menuRef} type="button" className="tg-menu-btn" aria-label="Open menu" aria-expanded={open} aria-controls="tg-sheet" onClick={() => setOpen(true)}>
              <Menu className="size-5" strokeWidth={1.75} />
            </button>
          </nav>
        </div>
      </header>
      {open ? (
        <div id="tg-sheet" className="tg-sheet" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="tg-sheet__panel">
            <div className="flex justify-end">
              <button ref={closeRef} type="button" className="tg-menu-btn !inline-flex" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="size-5" strokeWidth={1.75} />
              </button>
            </div>
            {[...LINKS, account].map((l) => (
              <Link key={l.href} href={l.href} className="tg-sheet__link" onClick={() => setOpen(false)}>{l.label}</Link>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
