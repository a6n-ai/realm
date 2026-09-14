"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboardIcon, MenuIcon, UsersIcon } from "lucide-react";
import { BottomNav, type BottomNavItem } from "@foundry/design-system";
import { MoreDrawer } from "./more-drawer";

export function AppBottomNav({ granted }: { granted?: string[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const canUsers = granted?.includes("user:list");

  const items: BottomNavItem[] = [
    {
      title: "Overview",
      icon: LayoutDashboardIcon,
      active: pathname === "/dashboard",
      href: "/dashboard",
    },
    ...(canUsers
      ? [
          {
            title: "Users",
            icon: UsersIcon,
            active: pathname.startsWith("/dashboard/settings/users"),
            href: "/dashboard/settings/users",
          },
        ]
      : []),
    { title: "More", icon: MenuIcon, active: moreOpen, onClick: () => setMoreOpen(true) },
  ];

  return (
    <>
      <BottomNav items={items} />
      <MoreDrawer open={moreOpen} onOpenChange={setMoreOpen} granted={granted} />
    </>
  );
}
