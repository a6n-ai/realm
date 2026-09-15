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
  const active =
    TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href ??
    TABS[0].href;

  return (
    <Tabs value={active}>
      <TabsList variant="line" aria-label="Dispatch sections" className="h-auto flex-wrap">
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
