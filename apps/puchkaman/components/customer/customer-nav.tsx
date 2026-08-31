"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@foundry/ui/cn";

const LINKS = [
  { href: "/me", label: "Overview" },
  { href: "/me/orders", label: "Orders" },
  { href: "/me/account", label: "Account" },
];

export function CustomerNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-2" aria-label="Your account">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm",
              active ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/50",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
