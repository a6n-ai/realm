"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RoleValue } from "@realm/commons";
import { cn } from "@realm/ui/cn";
import { ACCOUNT_NAV } from "./nav.config";

// Left sub-nav for the account settings shell. Driven entirely by ACCOUNT_NAV so
// the visible items match the per-page guards. usePathname drives the active
// state (aria-current="page"); links stay keyboard reachable with focus rings.
export function AccountNav({ role }: { role: RoleValue }) {
  const pathname = usePathname();
  const groups = ACCOUNT_NAV[role] ?? [];
  const isActive = (href: string) => pathname === href;

  const linkClass = (active: boolean) =>
    cn(
      "ring-offset-background focus-visible:ring-ring rounded-md text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
      active
        ? "bg-muted text-foreground font-medium"
        : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
    );

  return (
    <nav aria-label="Account settings">
      {/* Mobile (<md): a single horizontally scrollable row of every item. */}
      <ul className="-mx-1 -my-1 flex gap-1 overflow-x-auto px-1 py-1 md:hidden">
        {groups
          .flatMap((g) => g.items)
          .map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.key} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(linkClass(active), "block px-3 py-1.5 whitespace-nowrap")}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
      </ul>

      {/* Desktop (md+): grouped vertical rail. Group labels are non-heading
          elements (role=group + aria-labelledby) so they stay out of the document
          heading outline — the section content cards own the only h2s. */}
      <div className="hidden md:flex md:flex-col md:gap-6">
        {groups.map((group, i) => {
          const labelId = group.heading ? `account-nav-group-${i}` : undefined;
          return (
            <div
              key={group.heading ?? i}
              className="flex flex-col gap-1"
              role={group.heading ? "group" : undefined}
              aria-labelledby={labelId}
            >
              {group.heading && (
                <p
                  id={labelId}
                  className="text-muted-foreground px-3 text-xs font-medium tracking-wide uppercase"
                >
                  {group.heading}
                </p>
              )}
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(linkClass(active), "block px-3 py-1.5")}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
