"use client";

import { usePathname } from "next/navigation";
import { CalendarDaysIcon, LayoutDashboardIcon, SettingsIcon, UserIcon } from "lucide-react";
import { BottomNav, type BottomNavItem } from "@foundry/design-system";

const TABS = [
  { href: "/me", title: "Overview", icon: LayoutDashboardIcon },
  { href: "/me/classes", title: "Classes", icon: CalendarDaysIcon },
  { href: "/me/friends", title: "Profile", icon: UserIcon },
  { href: "/me/account", title: "Settings", icon: SettingsIcon },
] as const;

export function CustomerBottomNav() {
  const pathname = usePathname();

  const items: BottomNavItem[] = TABS.map((t) => ({
    title: t.title,
    icon: t.icon,
    active: t.href === "/me" ? pathname === "/me" : pathname.startsWith(t.href),
    href: t.href,
  }));

  return <BottomNav items={items} variant="glass" />;
}
