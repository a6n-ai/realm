"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import type { RoutedTabNavItem } from "@foundry/design-system";

const DATE_KEYS = ["from", "to"] as const;

/** Tab links that keep the section date (`from`/`to`) and drop every other param. */
export function DatedTabNav({
  tabs,
  ariaLabel,
}: {
  tabs: readonly RoutedTabNavItem[];
  ariaLabel?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const active =
    tabs
      .filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? tabs[0]?.href;
  const sp = new URLSearchParams();
  for (const key of DATE_KEYS) {
    const v = params.get(key);
    if (v) sp.set(key, v);
  }
  const qs = sp.toString();

  return (
    <Tabs value={active}>
      <TabsList variant="line" aria-label={ariaLabel} className="h-auto flex-wrap">
        {tabs.map((t) => (
          <TabsTrigger key={t.href} value={t.href} asChild>
            <Link href={qs ? `${t.href}?${qs}` : t.href} prefetch={false}>
              {t.icon ? <t.icon /> : null}
              {t.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
