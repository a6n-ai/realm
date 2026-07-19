"use client";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDaysIcon, HomeIcon, UtensilsCrossedIcon, WalletIcon } from "lucide-react";
import { BottomNav, type BottomNavItem } from "@realm/design-system";

const TABS = [
  { href: "/me", title: "Home", icon: HomeIcon },
  { href: "/me/menu", title: "Menu", icon: UtensilsCrossedIcon },
  { href: "/me/deliveries", title: "Deliveries", icon: CalendarDaysIcon },
  { href: "/me/wallet", title: "Finances", icon: WalletIcon },
];

export function CustomerBottomNav({ hasLivePlan = false }: { hasLivePlan?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const items: BottomNavItem[] = TABS.map((t) => ({
    title: t.title,
    icon: t.icon,
    href: t.href,
    active: t.href === "/me" ? pathname === "/me" : pathname.startsWith(t.href),
  }));
  const fabHref = hasLivePlan ? "/me/deliveries" : "/subscribe";
  return (
    <BottomNav
      items={items}
      onFabClick={() => router.push(fabHref)}
      fabLabel={hasLivePlan ? "Open calendar to pick meals" : "Start a subscription"}
      fabCaption={hasLivePlan ? "My plan" : "New plan"}
    />
  );
}
