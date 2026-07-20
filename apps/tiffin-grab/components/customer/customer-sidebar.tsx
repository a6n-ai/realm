"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDaysIcon,
  ChefHatIcon,
  HomeIcon,
  LifeBuoyIcon,
  LogOutIcon,
  UserIcon,
  UtensilsCrossedIcon,
  WalletIcon,
} from "lucide-react";
import { signOut } from "@/lib/auth/client";
import { CUSTOMER_ACCOUNT_NAV } from "@/app/(customer)/me/(account-settings)/nav.config";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@realm/ui/sidebar";

type NavItem = { title: string; href: string; icon: LucideIcon };
type NavSection = { label: string; items: NavItem[] };

// Grouped like admin AppSidebar — section labels orient desktop; icon mode hides labels.
export const CUSTOMER_NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [{ title: "Home", href: "/me", icon: HomeIcon }],
  },
  {
    label: "Meals",
    items: [
      { title: "Menu", href: "/me/menu", icon: ChefHatIcon },
      { title: "Deliveries", href: "/me/deliveries", icon: CalendarDaysIcon },
      { title: "Preferences", href: "/me/meals", icon: UtensilsCrossedIcon },
    ],
  },
  {
    label: "Finances",
    items: [{ title: "Finances", href: "/me/wallet", icon: WalletIcon }],
  },
  {
    label: "Account",
    items: [
      { title: "Account", href: "/me/account", icon: UserIcon },
      { title: "Support", href: "/me/support", icon: LifeBuoyIcon },
    ],
  },
];

const ACCOUNT_PATHS = new Set(["/me/account", ...CUSTOMER_ACCOUNT_NAV.map((item) => item.href)]);

export function CustomerSidebar({
  user: _user,
}: {
  user: { name: string | null; email: string; image: string | null };
}) {
  // Layout passes session user for a future avatar footer; nav is role-free for customers.
  void _user;
  const pathname = usePathname();
  const router = useRouter();
  // "/me" must match exactly — startsWith would also light it on /me/deliveries.
  const isActive = (href: string) => {
    if (href === "/me") return pathname === href;
    if (href === "/me/account") return ACCOUNT_PATHS.has(pathname);
    if (href === "/me/support") return pathname.startsWith("/me/support");
    return pathname.startsWith(href);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/me" className="group flex items-center gap-2 px-2 py-1.5">
          <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
            <UtensilsCrossedIcon className="size-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">Tiffin Grab</span>
            <span className="text-muted-foreground text-xs">Meals</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {CUSTOMER_NAV_SECTIONS.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarMenu>
              {section.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
              onClick={async () => {
                await signOut();
                router.push("/login");
              }}
            >
              <LogOutIcon />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
