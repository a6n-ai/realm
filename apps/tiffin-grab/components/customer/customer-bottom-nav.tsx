"use client";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDaysIcon, HomeIcon, UserIcon, UtensilsCrossedIcon } from "lucide-react";
import { BottomNav, type BottomNavItem } from "@realm/design-system";

const TABS = [
  { href: "/me", title: "Home", icon: HomeIcon },
  { href: "/me/menu", title: "Menu", icon: UtensilsCrossedIcon },
  { href: "/me/deliveries", title: "Deliveries", icon: CalendarDaysIcon },
  { href: "/me/account", title: "Account", icon: UserIcon },
];

export function CustomerBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const items: BottomNavItem[] = TABS.map((t) => ({
    title: t.title,
    icon: t.icon,
    href: t.href,
    active:
      t.href === "/me"
        ? pathname === "/me"
        : pathname === t.href || pathname.startsWith(`${t.href}/`),
  }));
  return (
    <BottomNav
      items={items}
      onFabClick={() => router.push("/subscribe")}
      fabLabel="Start a subscription"
      fabCaption="New plan"
    />
  );
}
