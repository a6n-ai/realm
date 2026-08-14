"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BanknoteIcon,
  BookOpenIcon,
  FolderTreeIcon,
  LayoutDashboardIcon,
  LayersIcon,
  LogOutIcon,
  PackageIcon,
  PercentIcon,
  PrinterIcon,
  ReceiptIcon,
  PuzzleIcon,
  ScrollTextIcon,
  BellIcon,
  SettingsIcon,
  TruckIcon,
  UserIcon,
  UsersIcon,
  UtensilsCrossedIcon,
  type LucideIcon,
} from "lucide-react";
import { CLOVER_PLUGIN_ID, cloverNavSections } from "@realm/clover/plugin";
import type { PluginCatalogStatus } from "@realm/crm";
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
} from "@realm/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@realm/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@realm/ui/avatar";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};
export type NavSection = { label: string; items: NavItem[] };

const COMMERCE_ITEMS: NavItem[] = [
  { title: "Products", href: "/dashboard/products", icon: UtensilsCrossedIcon },
  { title: "Orders", href: "/dashboard/orders", icon: PackageIcon },
  { title: "Finance", href: "/dashboard/finance", icon: BanknoteIcon },
];

const CLOVER_CATALOG_ITEMS: NavItem[] = [
  { title: "Categories", href: "/dashboard/clover/categories", icon: FolderTreeIcon },
  {
    title: "Modifier groups",
    href: "/dashboard/clover/modifier-groups",
    icon: LayersIcon,
  },
  { title: "Menus", href: "/dashboard/clover/menus", icon: BookOpenIcon },
  { title: "Taxes and fees", href: "/dashboard/clover/taxes", icon: ReceiptIcon },
  { title: "Printer labels", href: "/dashboard/clover/labels", icon: PrinterIcon },
  { title: "Discounts", href: "/dashboard/clover/discounts", icon: PercentIcon },
  { title: "Employees", href: "/dashboard/clover/employees", icon: UsersIcon },
];

/**
 * Build sidebar/more-drawer sections from the plugin registry's resolved
 * statuses (see `@/lib/plugins.server`) instead of an app-local boolean —
 * `PLUGINS` is server-only (DB-backed store), so the layout resolves statuses
 * once and this client component composes nav from the plain-JSON result.
 *
 * When Clover is installed, Products / Orders / Finance live under the Clover
 * group (puchkaman commerce is Clover-centric) alongside the catalog tools and
 * whatever nav Clover's plugin itself contributes (today: Connection). Before
 * install, commerce stays under Operations. Ordering: Overview first, plugin
 * sections, Administration last.
 */
export function getNavSections(opts: {
  statuses: Record<string, PluginCatalogStatus>;
}): NavSection[] {
  const sections: NavSection[] = [
    {
      label: "Overview",
      items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon }],
    },
  ];

  const cloverStatus = opts.statuses[CLOVER_PLUGIN_ID] ?? { installed: false };
  if (cloverStatus.installed) {
    const cloverItems = cloverNavSections(cloverStatus).flatMap((s) => s.items);
    sections.push({
      label: "Clover",
      items: [...COMMERCE_ITEMS, ...CLOVER_CATALOG_ITEMS, ...cloverItems],
    });
  } else {
    sections.push({
      label: "Operations",
      items: COMMERCE_ITEMS,
    });
  }

  sections.push({
    label: "Administration",
    items: [
      { title: "Logs", href: "/dashboard/logs", icon: ScrollTextIcon },
      { title: "Notifications", href: "/dashboard/notifications", icon: BellIcon },
      { title: "Settings", href: "/dashboard/settings", icon: SettingsIcon },
      { title: "Delivery", href: "/dashboard/settings/delivery/options", icon: TruckIcon },
      { title: "Integrations", href: "/dashboard/settings/integrations", icon: PuzzleIcon },
      { title: "Account", href: "/dashboard/account", icon: UserIcon },
    ],
  });

  return sections;
}

/** @deprecated Prefer getNavSections — kept for any static consumers. */
export const SECTIONS: NavSection[] = getNavSections({ statuses: {} });

export function AppSidebar({
  user,
  statuses = {},
}: {
  user: { email: string; name?: string | null; role?: string | null };
  statuses?: Record<string, PluginCatalogStatus>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const label = user.name?.trim() || user.email;
  const initials = label.slice(0, 2).toUpperCase();
  const sections = getNavSections({ statuses });
  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === href;
    // Avoid Settings lighting up while on Connection (/dashboard/settings/clover).
    if (href === "/dashboard/settings") {
      return pathname === href || pathname === "/dashboard/settings/";
    }
    return pathname.startsWith(href);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/dashboard" className="group flex items-center gap-2 px-2 py-1.5">
          <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
            <UtensilsCrossedIcon className="size-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">Puchkaman</span>
            <span className="text-muted-foreground text-xs">Operations</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <Avatar className="size-8 rounded-md">
                    <AvatarFallback className="rounded-md">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col leading-tight">
                    <span className="truncate text-sm font-medium">{label}</span>
                    <span className="text-muted-foreground text-xs capitalize">{user.role ?? "unknown"}</span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-56">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="truncate font-medium">{label}</span>
                  <span className="text-muted-foreground truncate text-xs font-normal">
                    {user.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/account">
                      <UserIcon data-icon="inline-start" />
                      Account
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/settings">
                      <SettingsIcon data-icon="inline-start" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    void signOut({
                      fetchOptions: {
                        onSuccess: () => {
                          router.push("/login");
                        },
                      },
                    })
                  }
                >
                  <LogOutIcon data-icon="inline-start" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
