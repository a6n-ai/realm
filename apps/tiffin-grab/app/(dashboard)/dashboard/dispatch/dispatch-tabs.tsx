"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TruckIcon, CheckCircle2Icon, UsersIcon, ArchiveIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";

const TABS = [
  { href: "/dashboard/dispatch", label: "Dispatch", icon: TruckIcon },
  { href: "/dashboard/dispatch/completions", label: "Completions", icon: CheckCircle2Icon },
  { href: "/dashboard/dispatch/drivers", label: "Drivers", icon: UsersIcon },
  { href: "/dashboard/dispatch/stale", label: "Stale", icon: ArchiveIcon },
] as const;

// RoutedTabNav can't be reused here: it doesn't preserve query params across
// tab navigation, and every dispatch tab needs `?date=` carried along.
export function DispatchTabs({ date }: { date: string }) {
  const pathname = usePathname();
  // Exact match only — "/dashboard/dispatch" is itself a string-prefix of every sibling
  // route, so a startsWith() check here would always match "Dispatch" first regardless of
  // which tab is actually open. None of these four routes nest further, so exact match
  // is the correct (and only correct) rule.
  const active = TABS.find((t) => pathname === t.href)?.href ?? TABS[0].href;

  return (
    <Tabs value={active}>
      <TabsList variant="line" aria-label="Dispatch sections" className="h-auto flex-wrap overflow-x-visible">
        {TABS.map((t) => (
          <TabsTrigger key={t.href} value={t.href} asChild>
            <Link href={`${t.href}?date=${date}`} prefetch={false}>
              <t.icon /> {t.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
