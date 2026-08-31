"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BanknoteIcon,
  BookOpenIcon,
  CalendarHeartIcon,
  Building2Icon,
  ContactIcon,
  FolderTreeIcon,
  LayoutDashboardIcon,
  LayersIcon,
  LogOutIcon,
  PackageIcon,
  PercentIcon,
  PrinterIcon,
  ReceiptIcon,
  ScrollTextIcon,
  BellIcon,
  SettingsIcon,
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
  /** "resource:action" this destination needs. Absent means always visible. */
  permission?: string;
};
export type NavSection = { label: string; items: NavItem[] };

const COMMERCE_ITEMS: NavItem[] = [
  { title: "Products", href: "/dashboard/products", icon: UtensilsCrossedIcon, permission: "product:read" },
  { title: "Orders", href: "/dashboard/orders", icon: PackageIcon, permission: "order:read" },
  { title: "Finance", href: "/dashboard/finance", icon: BanknoteIcon, permission: "finance:read" },
];

// Customers are ours (a `users` row that signs in at /me), not a Clover
// entity — Clover's own people are the separate "Customer Directory" further
// down. Kept out of COMMERCE_ITEMS so it never gets folded into the "Clover"
// section on install — it belongs in Overview regardless of Clover status.
const CUSTOMERS_ITEM: NavItem = {
  title: "Customers",
  href: "/dashboard/customers",
  icon: ContactIcon,
  permission: "user:list",
};

// Catering inquiries are ours end to end — own table, own service, no Clover
// sync — so they never move into the Clover group the way COMMERCE_ITEMS does
// on install; this item stays in Overview whether or not Clover is connected.
const CATERING_ITEM: NavItem = {
  title: "Catering",
  href: "/dashboard/catering",
  icon: CalendarHeartIcon,
  permission: "order:read",
};

const CLOVER_CATALOG_ITEMS: NavItem[] = [
  { title: "Categories", href: "/dashboard/clover/categories", icon: FolderTreeIcon, permission: "clover:read" },
  {
    title: "Modifier groups",
    href: "/dashboard/clover/modifier-groups",
    icon: LayersIcon,
    permission: "clover:read",
  },
  { title: "Menus", href: "/dashboard/clover/menus", icon: BookOpenIcon, permission: "clover:read" },
  { title: "Taxes and fees", href: "/dashboard/clover/taxes", icon: ReceiptIcon, permission: "clover:read" },
  { title: "Printer labels", href: "/dashboard/clover/labels", icon: PrinterIcon, permission: "clover:read" },
  { title: "Discounts", href: "/dashboard/clover/discounts", icon: PercentIcon, permission: "clover:read" },
  { title: "Employees", href: "/dashboard/clover/employees", icon: UsersIcon, permission: "clover:read" },
  // Named distinctly from COMMERCE_ITEMS' "Customers" (our own `users` table,
  // /dashboard/customers) — this is Clover's own Customer Directory, a
  // different entity that happens to sit in the same sidebar group.
  { title: "Customer Directory", href: "/dashboard/clover/customers", icon: ContactIcon, permission: "clover:read" },
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
  /** Granted "resource:action" keys. Omitted means unfiltered — existing callers keep today's behaviour. */
  granted?: string[];
}): NavSection[] {
  const sections: NavSection[] = [
    {
      label: "Overview",
      items: [
        { title: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon },
        CATERING_ITEM,
        CUSTOMERS_ITEM,
      ],
    },
  ];

  const cloverStatus = opts.statuses[CLOVER_PLUGIN_ID] ?? { installed: false };
  if (cloverStatus.installed) {
    const cloverItems = cloverNavSections(cloverStatus)
      .flatMap((s) => s.items)
      // "Connection" (merchant OAuth/reconnect) is dropped: it's already
      // reachable via the Settings page's own Clover card, and its page stays
      // behind requireAdmin() so it can't take the same clover:read grant
      // member holds for the read-only employee list.
      .filter((item) => item.href !== "/dashboard/settings/clover")
      .map((item) => ({ ...item, permission: "clover:read" }));
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
      {
        title: "Organization",
        href: "/dashboard/organization/clients",
        icon: Building2Icon,
        permission: "organization:read",
      },
      { title: "Logs", href: "/dashboard/logs", icon: ScrollTextIcon, permission: "audit:read" },
      { title: "Notifications", href: "/dashboard/notifications", icon: BellIcon, permission: "settings:hub" },
      { title: "Settings", href: "/dashboard/settings", icon: SettingsIcon, permission: "settings:hub" },
    ],
  });

  if (!opts.granted) return sections;
  return sections
    .map((s) => ({ ...s, items: filterByPermission(s.items, opts.granted) }))
    // An empty section would render as a heading with nothing under it.
    .filter((s) => s.items.length > 0);
}

function filterByPermission(items: NavItem[], granted?: string[]): NavItem[] {
  if (!granted) return items;
  const allowed = new Set(granted);
  return items.filter((i) => !i.permission || allowed.has(i.permission));
}

const USER_MENU_ITEMS: NavItem[] = [
  { title: "Account", href: "/dashboard/account", icon: UserIcon },
  { title: "Settings", href: "/dashboard/settings", icon: SettingsIcon, permission: "settings:hub" },
];

/**
 * The footer dropdown's destinations. It renders outside getNavSections, so it
 * needs its own pass through the same filter — an ungated Settings link here
 * sends a member to a page whose requireAdmin() throws.
 */
export function getUserMenuItems(granted?: string[]): NavItem[] {
  return filterByPermission(USER_MENU_ITEMS, granted);
}

/** @deprecated Prefer getNavSections — kept for any static consumers. */
export const SECTIONS: NavSection[] = getNavSections({ statuses: {} });

export function AppSidebar({
  user,
  statuses = {},
  granted,
}: {
  user: { email: string; name?: string | null; role?: string | null };
  statuses?: Record<string, PluginCatalogStatus>;
  granted?: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const label = user.name?.trim() || user.email;
  const initials = label.slice(0, 2).toUpperCase();
  const sections = getNavSections({ statuses, granted });
  const menuItems = getUserMenuItems(granted);
  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === href;
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
                  {menuItems.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link href={item.href}>
                        <item.icon data-icon="inline-start" />
                        {item.title}
                      </Link>
                    </DropdownMenuItem>
                  ))}
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
