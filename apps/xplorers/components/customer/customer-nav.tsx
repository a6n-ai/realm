"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@foundry/ui/cn";

const LINKS = [
  { href: "/me", label: "Overview" },
  { href: "/me/classes", label: "My classes" },
  { href: "/me/friends", label: "Profile" },
  { href: "/me/wallet", label: "Finances" },
  { href: "/me/support", label: "Support" },
  { href: "/me/account", label: "Settings" },
];

/** Desktop top-bar pills for /me; phones use the bottom nav. */
export function CustomerNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 lg:flex" aria-label="Your account">
      {LINKS.map((link) => {
        const active =
          link.href === "/me" ? pathname === "/me" : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-10 items-center rounded-full px-4 text-sm transition-colors",
              active
                ? "bg-secondary text-secondary-foreground font-semibold"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground font-medium",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
