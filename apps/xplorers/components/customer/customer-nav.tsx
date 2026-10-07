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

export function CustomerNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-2" aria-label="Your account">
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
              "rounded-xl px-3 py-2.5 text-sm",
              active
                ? "bg-secondary text-secondary-foreground font-semibold"
                : "text-foreground/80 hover:bg-secondary/60 font-medium",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
