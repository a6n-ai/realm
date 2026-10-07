"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDaysIcon,
  CreditCardIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  SettingsIcon,
  ShapesIcon,
  TicketPercentIcon,
  WalletIcon,
  UserIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/lib/auth/client";
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
} from "@foundry/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@foundry/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { SITE_NAME } from "@/lib/brand";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  /** Other path prefixes that also mark this item active. */
  also?: string[];
};
export type NavSection = { label: string; items: NavItem[] };

export function getNavSections(opts: { granted?: string[] }): NavSection[] {
  const granted = new Set(opts.granted ?? []);
  const allow = (item: NavItem) => !item.permission || granted.has(item.permission);

  const overview: NavItem[] = [{ title: "Overview", href: "/dashboard", icon: LayoutDashboardIcon }];
  const studio: NavItem[] = [
    { title: "Classes", href: "/dashboard/classes", icon: ShapesIcon, permission: "studioSession:read" },
    { title: "Sessions", href: "/dashboard/sessions", icon: CalendarDaysIcon, permission: "studioSession:read" },
  ].filter(allow);
  const people: NavItem[] = [
    { title: "Customers", href: "/dashboard/customers", icon: UsersIcon, permission: "user:list" },
  ].filter(allow);
  const finance: NavItem[] = [
    { title: "Payments", href: "/dashboard/payments", icon: CreditCardIcon, permission: "settings:write" },
    {
      title: "Discounts",
      href: "/dashboard/discounts",
      icon: TicketPercentIcon,
      permission: "discount:read",
      also: ["/dashboard/catalog/discounts"],
    },
    { title: "Wallet", href: "/dashboard/wallet", icon: WalletIcon, permission: "wallet:read" },
  ].filter(allow);
  const admin: NavItem[] = [
    { title: "Settings", href: "/dashboard/settings", icon: SettingsIcon, permission: "settings:write" },
    { title: "Account", href: "/dashboard/account", icon: UserIcon },
  ].filter(allow);

  return [
    { label: "Overview", items: overview },
    { label: "Studio", items: studio },
    { label: "People", items: people },
    { label: "Finance", items: finance },
    { label: "Administration", items: admin },
  ].filter((s) => s.items.length > 0);
}

export function AppSidebar({
  user,
  granted,
}: {
  user: { email: string; name: string | null; role: string };
  granted?: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const sections = getNavSections({ granted });
  const initials = (user.name ?? user.email).slice(0, 2).toUpperCase();

  return (
    <Sidebar>
      <SidebarHeader>
        <p className="px-2 text-sm font-semibold">{SITE_NAME}</p>
      </SidebarHeader>
      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarMenu>
              {section.items.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href) || (item.also?.some((p) => pathname.startsWith(p)) ?? false);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active}>
                      {/* No viewport prefetch (every nav item at once overloads the box);
                          prefetch on intent instead, down to dashboard/loading.tsx. */}
                      <Link
                        href={item.href}
                        prefetch={false}
                        onMouseEnter={() => router.prefetch(item.href)}
                        onFocus={() => router.prefetch(item.href)}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="hover:bg-sidebar-accent flex w-full items-center gap-2 rounded-md p-2 text-left text-sm">
              <Avatar size="sm">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate">{user.name ?? user.email}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium">{user.name ?? "Account"}</p>
              <p className="text-muted-foreground truncate text-xs">{user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/account">
                <UserIcon />
                Account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void signOut({ fetchOptions: { onSuccess: () => router.push("/login") } })}
            >
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
