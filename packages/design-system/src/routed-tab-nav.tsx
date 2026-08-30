"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@realm/ui/cn";

export interface RoutedTabNavItem {
  href: string;
  label: string;
}

/**
 * Underline-style routed tab bar — same visual language as
 * @realm/notifications/ui's NotificationsNav, generalized so every
 * multi-section settings page (Delivery, Organization, ...) looks the same
 * rather than each standing up its own tab style. Active tab is derived from
 * the URL (prefix match), not local state — the URL is the source of truth
 * for which section is open.
 */
export function RoutedTabNav({ tabs, ariaLabel }: { tabs: readonly RoutedTabNavItem[]; ariaLabel?: string }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b" aria-label={ariaLabel}>
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
