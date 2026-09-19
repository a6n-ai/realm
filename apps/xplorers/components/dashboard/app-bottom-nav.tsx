"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { CalendarDaysIcon, LayoutDashboardIcon, MenuIcon, ShapesIcon } from "lucide-react";
import { BottomNav, type BottomNavItem } from "@foundry/design-system";
import { MoreDrawer } from "./more-drawer";

export function AppBottomNav({ granted }: { granted?: string[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const canSessions = granted?.includes("studioSession:read");

  const items: BottomNavItem[] = [
    {
      title: "Overview",
      icon: LayoutDashboardIcon,
      active: pathname === "/dashboard",
      href: "/dashboard",
    },
    ...(canSessions
      ? [
          {
            title: "Classes",
            icon: ShapesIcon,
            active: pathname.startsWith("/dashboard/classes"),
            href: "/dashboard/classes",
          },
          {
            title: "Sessions",
            icon: CalendarDaysIcon,
            active: pathname.startsWith("/dashboard/sessions"),
            href: "/dashboard/sessions",
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
