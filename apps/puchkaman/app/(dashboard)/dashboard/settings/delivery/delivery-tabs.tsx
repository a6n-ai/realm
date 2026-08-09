"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListTreeIcon, MapPinnedIcon, type LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@realm/ui/tabs";

type SubTab = { label: string; href: string; icon: LucideIcon };

const SUBTABS: SubTab[] = [
  { label: "Delivery options", href: "/dashboard/settings/delivery/options", icon: ListTreeIcon },
  { label: "Coverage", href: "/dashboard/settings/delivery/zones", icon: MapPinnedIcon },
];

/** Routed sub-tabs — active derived from pathname (finance pattern). */
export function DeliveryTabs() {
  const pathname = usePathname();
  const active =
    SUBTABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href ?? "";

  return (
    <Tabs value={active}>
      <TabsList aria-label="Delivery settings sections">
        {SUBTABS.map((tab) => (
          <TabsTrigger key={tab.href} value={tab.href} asChild>
            <Link href={tab.href}>
              <tab.icon />
              {tab.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
