"use client";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDaysIcon, HomeIcon, UtensilsCrossedIcon, WalletIcon } from "lucide-react";
import { BottomNav, type BottomNavItem } from "@realm/design-system";

const TABS = [
  { href: "/me", title: "Home", icon: HomeIcon },
  { href: "/me/menu", title: "Menu", icon: UtensilsCrossedIcon },
  { href: "/me/deliveries", title: "Deliveries", icon: CalendarDaysIcon },
  { href: "/me/wallet", title: "Wallet", icon: WalletIcon },
];

// TABS is built as an array so later tasks can add more (account, orders, …)
// without reshaping this component. "/me" must match exactly — startsWith
// would also match "/me/deliveries" and light both tabs at once.
export function CustomerBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const items: BottomNavItem[] = TABS.map((t) => ({
    title: t.title,
    icon: t.icon,
    href: t.href,
    active: t.href === "/me" ? pathname === "/me" : pathname.startsWith(t.href),
  }));
  return <BottomNav items={items} onFabClick={() => router.push("/subscribe")} fabLabel="Order" />;
}
