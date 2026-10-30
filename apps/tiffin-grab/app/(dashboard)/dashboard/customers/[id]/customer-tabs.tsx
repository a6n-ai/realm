"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActivityIcon, GiftIcon, LayoutDashboardIcon, MapPinIcon, PackageIcon, RefreshCwIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";

const TABS = [
  { seg: "", label: "Overview", icon: LayoutDashboardIcon },
  { seg: "/orders", label: "Orders", icon: PackageIcon },
  { seg: "/renewals", label: "Renewals", icon: RefreshCwIcon },
  { seg: "/referrals", label: "Referrals", icon: GiftIcon },
  { seg: "/addresses", label: "Addresses", icon: MapPinIcon },
  { seg: "/activity", label: "Activity", icon: ActivityIcon },
] as const;

/** RoutedTabNav's line tabs, but Overview is the bare customer URL, so the longest matching href wins (a prefix match would light Overview on every tab). */
export function CustomerTabs({ customerPublicId }: { customerPublicId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/customers/${customerPublicId}`;
  const active = [...TABS].reverse().find((t) => pathname === base + t.seg || pathname.startsWith(`${base}${t.seg}/`))?.seg ?? "";
  return (
    <Tabs value={active}>
      <TabsList variant="line" aria-label="Customer sections" className="h-auto flex-wrap">
        {TABS.map((t) => (
          <TabsTrigger key={t.seg} value={t.seg} asChild>
            <Link href={base + t.seg} prefetch={false}>
              <t.icon />
              {t.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
