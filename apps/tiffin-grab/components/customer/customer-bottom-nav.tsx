"use client";
import { usePathname } from "next/navigation";
import { CalendarDaysIcon } from "lucide-react";
import { BottomNav, type BottomNavItem } from "@realm/design-system";

const TABS = [{ href: "/me/deliveries", title: "Deliveries", icon: CalendarDaysIcon }];

// v1 has one tab; TABS is built as an array so later tasks can add more
// (account, orders, …) without reshaping this component.
export function CustomerBottomNav() {
  const pathname = usePathname();
  const items: BottomNavItem[] = TABS.map((t) => ({
    title: t.title,
    icon: t.icon,
    href: t.href,
    active: pathname.startsWith(t.href),
  }));
  return <BottomNav items={items} />;
}
