"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";

export interface RoutedTabNavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
}

/**
 * The one tab bar for every multi-section page (Notifications, Organization,
 * Analytics, Wallet, Discounts, Payments, Finance, Delivery settings, ...) —
 * shadcn's Tabs primitive (@foundry/ui/tabs) with the `line` (underline)
 * variant, each trigger a real Link so every sub-section keeps its own URL.
 * Active tab derives from the pathname (prefix match), not local state — the
 * URL is the source of truth for which section is open.
 */
export function RoutedTabNav({ tabs, ariaLabel }: { tabs: readonly RoutedTabNavItem[]; ariaLabel?: string }) {
  const pathname = usePathname();
  const active = tabs.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href ?? tabs[0]?.href;

  return (
    <Tabs value={active}>
      <TabsList variant="line" aria-label={ariaLabel} className="h-auto flex-wrap">
        {tabs.map((t) => (
          <TabsTrigger key={t.href} value={t.href} asChild>
            <Link href={t.href}>
              {t.icon ? <t.icon /> : null}
              {t.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
