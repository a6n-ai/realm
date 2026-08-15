"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboardIcon, MenuIcon, PackageIcon } from "lucide-react";
import { BottomNav, type BottomNavItem } from "@realm/design-system";
import type { PluginCatalogStatus } from "@realm/crm";
import { MoreDrawer } from "./more-drawer";

const TABS = [
  { href: "/dashboard", title: "Overview", icon: LayoutDashboardIcon },
  { href: "/dashboard/products", title: "Products", icon: PackageIcon },
] as const;

/** Mobile bottom nav — sidebar is desktop-only (CrmShell hideSidebarOnMobile). */
export function AppBottomNav({
  statuses = {},
  granted,
}: {
  statuses?: Record<string, PluginCatalogStatus>;
  granted?: string[];
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const items: BottomNavItem[] = [
    ...TABS.map((t) => ({
      title: t.title,
      icon: t.icon,
      active: t.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(t.href),
      href: t.href,
    })),
    { title: "More", icon: MenuIcon, active: moreOpen, onClick: () => setMoreOpen(true) },
  ];

  return (
    <>
      <BottomNav items={items} />
      <MoreDrawer open={moreOpen} onOpenChange={setMoreOpen} statuses={statuses} granted={granted} />
    </>
  );
}
