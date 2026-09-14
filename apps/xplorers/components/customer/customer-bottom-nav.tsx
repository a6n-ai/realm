"use client";

import { usePathname } from "next/navigation";
import { LayoutDashboardIcon, UserIcon } from "lucide-react";
import { BottomNav, type BottomNavItem } from "@foundry/design-system";

const TABS = [
  { href: "/me", title: "Overview", icon: LayoutDashboardIcon },
  { href: "/me/account", title: "Account", icon: UserIcon },
] as const;

export function CustomerBottomNav() {
  const pathname = usePathname();

  const items: BottomNavItem[] = TABS.map((t) => ({
    title: t.title,
    icon: t.icon,
    active: t.href === "/me" ? pathname === "/me" : pathname.startsWith(t.href),
    href: t.href,
  }));

  return <BottomNav items={items} />;
}
