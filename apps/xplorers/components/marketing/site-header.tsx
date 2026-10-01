"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/client";
import { landingPathFor } from "@/lib/auth/landing";
import { Role, type RoleValue } from "@foundry/commons";
import { NAV } from "@/lib/marketing/content";
import { Button } from "@/components/marketing/ui";

function isActive(pathname: string, href: string) {
  if (href.startsWith("/#")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as { role?: RoleValue } | undefined)?.role;
  const accountHref = session?.user ? landingPathFor(role ?? Role.USER) : "/login";
  const accountLabel = session?.user ? (session.user.name?.split(" ")[0] ?? "Account") : "Log in";

  useEffect(() => {
    setTimeout(() => setOpen(false), 0);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="xl-header">
      <div className="xl-wrap xl-header-bar">
        <Link href="/" className="xl-logo">
          <Image
            src="/brand/logo-xplorers.png"
            alt="Xplorers.Life — Hands-on learning & maker space"
            width={555}
            height={245}
            priority
          />
        </Link>
        <nav className="xl-nav" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="xl-nav-link"
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="xl-header-actions">
          <Button size="sm" variant="secondary" href={accountHref} className="xl-account">
            {accountLabel}
          </Button>
          <Button size="sm" icon="arrow-up-right" href="/contact" className="xl-header-cta">
            Let&rsquo;s chat
          </Button>
          <button
            type="button"
            className="xl-burger"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="xl-mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>
      <nav id="xl-mobile-nav" className="xl-sheet" data-open={open ? "" : undefined} aria-label="Main" inert={!open}>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {item.label}
          </Link>
        ))}
        <Link href={accountHref} onClick={() => setOpen(false)}>
          {accountLabel}
        </Link>
        <Button href="/contact" icon="arrow-up-right" block>
          Let&rsquo;s chat
        </Button>
      </nav>
    </header>
  );
}
