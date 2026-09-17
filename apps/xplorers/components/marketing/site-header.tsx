"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/client";
import { landingPathFor } from "@/lib/auth/landing";
import { Role, type RoleValue } from "@foundry/commons";
import { NAV } from "@/lib/marketing/content";
import { XplButton } from "@/components/marketing/xpl-ui";

function isActive(pathname: string, href: string) {
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
    setOpen(false);
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
    <nav className="xpl-nav relative">
      <Link href="/" className="xpl-disp text-[20px] tracking-[-0.02em] lg:text-[22px]">
        Xplorers
      </Link>
      <div className="ml-6 hidden flex-1 items-center gap-7 text-[15px] font-medium lg:flex">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} data-active={isActive(pathname, item.href) ? "true" : undefined}>
            {item.label}
          </Link>
        ))}
      </div>
      <div className="ml-auto hidden items-center gap-5 text-[15px] font-medium lg:flex">
        <Link href={accountHref}>{accountLabel}</Link>
        <XplButton href="/contact" className="px-[18px] py-2.5 text-[12px]">
          Book
        </XplButton>
      </div>
      <div className="ml-auto flex items-center gap-3 lg:hidden">
        <Link href="/contact" className="xpl-btn rounded-full px-3.5 py-2.5 text-[11px]">
          Book <span aria-hidden="true">→</span>
        </Link>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Menu"}
          aria-expanded={open}
          aria-controls="xpl-mobile-nav"
          onClick={() => setOpen((v) => !v)}
          className="xpl-burger"
        >
          <span />
          <span />
        </button>
      </div>
      {open ? (
        <div
          id="xpl-mobile-nav"
          className="absolute inset-x-0 top-14 z-50 border-b border-[var(--rule)] bg-[var(--bone)] px-5 py-6 pb-24 lg:hidden"
        >
          <div className="flex flex-col gap-4 text-[18px] font-medium">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-active={isActive(pathname, item.href) ? "true" : undefined}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link href={accountHref} onClick={() => setOpen(false)}>
              {accountLabel}
            </Link>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
