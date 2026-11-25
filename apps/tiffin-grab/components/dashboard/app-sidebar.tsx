"use client";

import { initials } from "@foundry/ui/initials";
import { useNavAllowed } from "@/components/dashboard/nav-access-provider";
import * as React from "react";
import type { ReactNode } from "react";
import {
  BarChart3Icon,
  BellIcon,
  Building2Icon,
  CalendarIcon,
  CheckIcon,
  ChefHatIcon,
  ChartLineIcon,
  ChevronRightIcon,
  BoxIcon,
  CoinsIcon,
  CopyIcon,
  EllipsisIcon,
  InboxIcon,
  LayoutGridIcon,
  LifeBuoyIcon,
  Loader2Icon,
  LockIcon,
  LogOutIcon,
  MegaphoneIcon,
  TruckIcon,
  WalletCardsIcon,
  WalletIcon,
  type LucideIcon,
  RefreshCwIcon,
  SettingsIcon,
  TagIcon,
  TicketPercentIcon,
  UserIcon,
  UsersIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { signOut } from "@/lib/auth/client";
import { lockSession } from "@/lib/auth/lock-actions";
import type { Section } from "@/lib/services/section-seen.service";
import Link, { useLinkStatus } from "next/link";
import { BrandMark, BrandWordmark } from "@/components/brand-logo";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@foundry/ui/cn";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  useSidebar,
} from "@foundry/ui/sidebar";
import { Collapsible, CollapsibleContent } from "@foundry/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@foundry/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@foundry/ui/avatar";
import { Button } from "@foundry/ui/button";
import { useFormatMoney } from "@/components/app-currency";
import { useCopy } from "@/lib/hooks/use-copy";
import {
  SIDEBAR_WIDTH_COOKIE,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  clampSidebarWidth,
} from "@/components/dashboard/sidebar-width";

export type NavItem = { title: string; href: string; icon: LucideIcon; children?: NavItem[] };
export type NavSection = {
  label: string;
  items: NavItem[];
  variant?: "primary" | "section" | "bottom" | "menu";
};

const WIDTH_STEP = 8;

function saveWidth(w: number) {
  try {
    document.cookie = `${SIDEBAR_WIDTH_COOKIE}=${w}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // Cookies blocked: the width still applies until reload.
  }
}

const ROW =
  "group/nav h-9 rounded-(--ui-radius-control) text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground data-active:bg-muted data-active:font-medium data-active:text-foreground";

// Swaps the nav icon for a spinner while this link's navigation is in flight.
// Dashboard routes are dynamic and unprefetched, so a click otherwise shows
// nothing until the server answers (300ms-1s+ from far regions).
function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <Loader2Icon aria-hidden className="size-4 animate-spin" strokeWidth={1.5} />
  ) : (
    <Icon className="size-4" strokeWidth={1.5} />
  );
}


/** Fired by MarkSectionRead so the sidebar clears a section's dot without a router.refresh(). */
export const SECTION_READ_EVENT = "section-read";

const SECTION_BY_HREF: Record<string, Section> = {
  "/dashboard/tickets": "tickets",
  "/dashboard/inquiries": "inquiries",
  "/dashboard/customers": "customers",
  "/dashboard/payments": "payments",
};

// Flat primary list, then `>` section items that expand inline to their pages. A section renders only
// when the caller's org permissions admit one of its pages (see lib/nav/nav-permissions.ts).
export const SECTIONS: NavSection[] = [
  {
    label: "Main",
    variant: "primary",
    items: [
      { title: "Overview", href: "/dashboard", icon: LayoutGridIcon },
      { title: "Orders", href: "/dashboard/orders", icon: BoxIcon },
      { title: "Inquiries", href: "/dashboard/inquiries", icon: InboxIcon },
      { title: "Customers", href: "/dashboard/customers", icon: UsersIcon },
      { title: "Renewals", href: "/dashboard/renewals", icon: RefreshCwIcon },
      { title: "Dispatch", href: "/dashboard/dispatch", icon: TruckIcon },
      { title: "Tickets", href: "/dashboard/tickets", icon: LifeBuoyIcon },
    ],
  },
  {
    label: "Sections",
    variant: "section",
    items: [
      {
        title: "Kitchen",
        href: "/dashboard/labels",
        icon: ChefHatIcon,
        children: [
          { title: "Daily labels", href: "/dashboard/labels", icon: TagIcon },
          { title: "Weekly Menus", href: "/dashboard/menus", icon: CalendarIcon },
          { title: "Catalog", href: "/dashboard/catalog", icon: UtensilsCrossedIcon },
        ],
      },
      {
        title: "Money",
        href: "/dashboard/payments",
        icon: WalletIcon,
        children: [
          { title: "Payments", href: "/dashboard/payments", icon: WalletCardsIcon },
          { title: "Wallet", href: "/dashboard/wallet", icon: CoinsIcon },
          { title: "Discounts", href: "/dashboard/discounts", icon: TicketPercentIcon },
        ],
      },
      {
        title: "Engage",
        href: "/dashboard/notifications",
        icon: MegaphoneIcon,
        children: [
          { title: "Notifications", href: "/dashboard/notifications", icon: BellIcon },
          { title: "Customer groups", href: "/dashboard/customer-groups", icon: UsersIcon },
        ],
      },
      {
        title: "Insights",
        href: "/dashboard/analytics",
        icon: ChartLineIcon,
        children: [{ title: "Analytics", href: "/dashboard/analytics", icon: BarChart3Icon }],
      },
    ],
  },
  {
    label: "Administration",
    variant: "bottom",
    items: [
      { title: "Settings", href: "/dashboard/settings", icon: SettingsIcon },
      { title: "Organization", href: "/dashboard/organization", icon: Building2Icon },
    ],
  },
  {
    label: "Personal",
    variant: "menu",
    items: [{ title: "Account", href: "/dashboard/account", icon: UserIcon }],
  },
];

// Every page a user can open, with section children expanded. Global search and the more drawer read this.
export const flatNavItems = (): NavItem[] => SECTIONS.flatMap((s) => s.items.flatMap((i) => i.children ?? [i]));

// Longest-prefix match: /dashboard/orders is not active while a more specific page under it is open.
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return (
    pathname.startsWith(href) &&
    !flatNavItems().some((i) => i.href.length > href.length && i.href.startsWith(href) && pathname.startsWith(i.href))
  );
}

// Serializable rep-coupon projection (mirrors RepCouponToday) — kept local so the
// client bundle never imports the server-only coupons service module.
export type RepCouponView = {
  code: string;
  used: number;
  total: number;
  capPct: number | null;
  capAmount: number | null;
};

export function AppSidebar({
  user,
  hasPin,
  repCoupon,
  activity,
  initialWidth = SIDEBAR_WIDTH_DEFAULT,
  search,
  orgSwitcher,
  bell,
  clock,
  relayConsoleUrl,
}: {
  user: { email: string; role: string; name: string | null; image: string | null };
  hasPin: boolean;
  repCoupon?: RepCouponView | null;
  activity?: Record<Section, boolean> | null;
  /** Saved width from the cookie, so the first paint matches the server-set --sidebar-width. */
  initialWidth?: number;
  /** Find box (GlobalSearch); a slot because the search imports SECTIONS from this module. */
  search?: ReactNode;
  /** Relay console, when EMAIL_VIA_RELAY is on: the Notifications item links there instead of the local page. */
  relayConsoleUrl?: string | null;
  /** Org switcher; renders nothing for a single-org session. */
  orgSwitcher?: ReactNode;
  /** Notification bell for the footer user row. */
  bell?: ReactNode;
  /** Clock card above the footer links. */
  clock?: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const navAllowed = useNavAllowed();
  const { state: sidebarState } = useSidebar();
  // Sections read since the layout last rendered `activity`. A fresh `activity`
  // (any refresh) already reflects those reads, so the set resets with it.
  const [read, setRead] = React.useState<{ from: typeof activity; set: ReadonlySet<Section> }>({ from: activity, set: new Set() });
  const readSet = read.from === activity ? read.set : new Set<Section>();
  React.useEffect(() => {
    const onRead = (e: Event) => {
      const section = (e as CustomEvent<Section>).detail;
      setRead((prev) => ({ from: activity, set: new Set([...(prev.from === activity ? prev.set : []), section]) }));
    };
    window.addEventListener(SECTION_READ_EVENT, onRead);
    return () => window.removeEventListener(SECTION_READ_EVENT, onRead);
  }, [activity]);
  const unread = (href: string) => {
    const section = SECTION_BY_HREF[href];
    return Boolean(section && activity?.[section] && !readSet.has(section));
  };

  // CrmShell's provider already carries the saved width as --sidebar-width, so nothing is written on mount.
  const [width, setWidth] = React.useState(initialWidth);
  const drag = React.useRef<{ startX: number; startWidth: number; next: number; moved: boolean } | null>(null);

  const wrapperOf = (el: HTMLElement) => el.closest<HTMLElement>('[data-slot="sidebar-wrapper"]');
  const setLiveWidth = (el: HTMLElement, w: number) => wrapperOf(el)?.style.setProperty("--sidebar-width", `${w}px`);
  const commitWidth = (el: HTMLElement, w: number) => {
    setWidth(w);
    setLiveWidth(el, w);
    saveWidth(w);
  };

  // Pointer capture keeps the drag on the handle even when the pointer leaves the sidebar.
  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: width, next: width, moved: false };
    wrapperOf(e.currentTarget)?.setAttribute("data-resizing", "");
  };
  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) >= 3) d.moved = true;
    d.next = clampSidebarWidth(d.startWidth + dx);
    setLiveWidth(e.currentTarget, d.next);
  };
  const endResize = (el: HTMLElement, commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    wrapperOf(el)?.removeAttribute("data-resizing");
    if (commit && d.moved) commitWidth(el, d.next);
    else setLiveWidth(el, d.startWidth);
  };

  const onResizeKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && drag.current) {
      e.preventDefault();
      endResize(e.currentTarget, false);
      return;
    }
    const next =
      e.key === "ArrowLeft" ? clampSidebarWidth(width - WIDTH_STEP)
      : e.key === "ArrowRight" ? clampSidebarWidth(width + WIDTH_STEP)
      : e.key === "Home" ? SIDEBAR_WIDTH_MIN
      : e.key === "End" ? SIDEBAR_WIDTH_MAX
      : null;
    if (next === null) return;
    e.preventDefault();
    commitWidth(e.currentTarget, next);
  };

  const userInitials = initials(user.name?.trim() || user.email);
  const allowedItems = (items: NavItem[]) => items.filter((item) => navAllowed(item.href));
  const allowedChildren = (item: NavItem) => (item.children ?? []).filter((child) => navAllowed(child.href));

  // Notifications goes to the Relay console when EMAIL_VIA_RELAY is on; every other href is unchanged.
  const hrefFor = (href: string) => (relayConsoleUrl && href === "/dashboard/notifications" ? relayConsoleUrl : href);
  const renderItem = (item: NavItem) => {
    const active = isNavActive(pathname, item.href);
    const external = hrefFor(item.href) !== item.href ? hrefFor(item.href) : null;
    return (
      <SidebarMenuItem key={item.href}>
        {/* No viewport prefetch (every nav item at once 503'd the box); prefetch
            on intent instead, down to the target page's own loading.tsx. */}
        <SidebarMenuButton
          isActive={active}
          tooltip={item.title}
          className={ROW}
          render={
            <Link
              href={external ?? item.href}
              prefetch={false}
              onMouseEnter={() => !external && router.prefetch(item.href)}
              onFocus={() => !external && router.prefetch(item.href)}
            />
          }
        >
          <NavIcon icon={item.icon} />
          <span>{item.title}</span>
          {unread(item.href) ? (
            <span aria-label="New activity" className="bg-primary ml-auto size-2 shrink-0 rounded-full" />
          ) : null}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const [sectionOpen, setSectionOpen] = React.useState<Record<string, boolean>>({});
  // Moving to another page inside a section drops the user's close on it, so the active section reopens.
  const [seenPath, setSeenPath] = React.useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    const holdsPage = (title: string) =>
      (SECTIONS.flatMap((s) => s.items).find((i) => i.title === title)?.children ?? []).some((c) => isNavActive(pathname, c.href));
    setSectionOpen((prev) => Object.fromEntries(Object.entries(prev).filter(([title]) => !holdsPage(title))));
  }

  const renderSection = (item: NavItem) => {
    const children = allowedChildren(item);
    const active = children.some((child) => isNavActive(pathname, child.href));
    const open = sectionOpen[item.title] ?? active;
    const dot = children.some((child) => unread(child.href));
    const panelId = `tg-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`;
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          type="button"
          isActive={active}
          tooltip={item.title}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setSectionOpen((prev) => ({ ...prev, [item.title]: !open }))}
          className={ROW}
        >
          <item.icon className="size-4" strokeWidth={1.5} />
          <span>{item.title}</span>
          {dot ? <span aria-label="New activity" className="bg-primary ml-auto size-2 shrink-0 rounded-full" /> : null}
          <ChevronRightIcon
            aria-hidden
            strokeWidth={1.5}
            className={cn(
              "text-muted-foreground size-4 transition-transform duration-150 motion-reduce:transition-none",
              open && "rotate-90",
              !dot && "ml-auto",
            )}
          />
        </SidebarMenuButton>
        <Collapsible open={open}>
          <CollapsibleContent id={panelId}>
            <SidebarMenuSub className="mt-0.5">
              {children.map((child) => (
                <SidebarMenuSubItem key={child.href}>
                  <SidebarMenuSubButton
                    isActive={isNavActive(pathname, child.href)}
                    className="text-muted-foreground hover:text-foreground data-active:text-foreground h-8 text-footnote transition-colors [&>svg]:text-current"
                    render={
                      <Link
                        href={hrefFor(child.href)}
                        prefetch={false}
                        aria-current={isNavActive(pathname, child.href) ? "page" : undefined}
                        onMouseEnter={() => hrefFor(child.href) === child.href && router.prefetch(child.href)}
                        onFocus={() => hrefFor(child.href) === child.href && router.prefetch(child.href)}
                      />
                    }
                  >
                    <NavIcon icon={child.icon} />
                    <span>{child.title}</span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>
      </SidebarMenuItem>
    );
  };

  const bottomItems = SECTIONS.filter((s) => s.variant === "bottom").flatMap((s) => allowedItems(s.items));

  return (
    <Sidebar collapsible="offcanvas" id="tg-sidebar" inert={sidebarState === "collapsed"}>
      <SidebarHeader>
        <div className="flex items-center gap-1 px-2 py-1.5">
          <Link href="/dashboard" aria-label="TiffinGrab home" className="flex min-w-0 flex-1 items-center gap-2">
            <BrandMark className="size-8" />
            <BrandWordmark className="text-lg" />
          </Link>
          {orgSwitcher}
        </div>
        {search ? <div className="px-2 pb-2">{search}</div> : null}
      </SidebarHeader>

      <SidebarContent>
        {SECTIONS.map((section) => {
          if (section.variant === "primary") {
            const items = allowedItems(section.items);
            if (items.length === 0) return null;
            return (
              <SidebarGroup key={section.label}>
                <SidebarMenu>{items.map(renderItem)}</SidebarMenu>
              </SidebarGroup>
            );
          }
          if (section.variant === "section") {
            const rows = section.items.flatMap((item) => (allowedChildren(item).length > 0 ? [renderSection(item)] : []));
            if (rows.length === 0) return null;
            return (
              <SidebarGroup key={section.label}>
                <SidebarSeparator />
                <SidebarMenu>{rows}</SidebarMenu>
              </SidebarGroup>
            );
          }
          return null;
        })}

      </SidebarContent>

      {repCoupon && <RepCouponCard coupon={repCoupon} />}

      <SidebarFooter>
        {clock ? <div className="px-2 pt-2">{clock}</div> : null}
        {bottomItems.length > 0 && <SidebarMenu>{bottomItems.map(renderItem)}</SidebarMenu>}
        <div className="flex items-center gap-1 px-2 py-1.5 [&_svg]:[stroke-width:1.5]">
          <Avatar className="size-8 rounded-md">
            <AvatarImage src={user.image ?? undefined} alt={user.name ?? user.email} className="rounded-md" />
            <AvatarFallback className="rounded-md">{userInitials}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{user.name?.trim() || user.email}</span>
            <span className="text-muted-foreground text-xs capitalize">{user.role}</span>
          </div>
          {bell}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Account menu" />}>
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56">
              <DropdownMenuLabel className="flex flex-col">
                <span className="truncate font-medium">{user.name?.trim() || user.email}</span>
                <span className="text-muted-foreground truncate text-xs font-normal capitalize">{user.role}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem render={<Link href="/dashboard/account" />}>
                  <UserIcon data-icon="inline-start" />
                  Account
                </DropdownMenuItem>
                {hasPin && (
                  <DropdownMenuItem
                    onClick={async () => {
                      await lockSession();
                      router.push("/login");
                    }}
                  >
                    <LockIcon data-icon="inline-start" />
                    Lock session
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/login"; } } })}>
                <LogOutIcon data-icon="inline-start" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarFooter>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-controls="tg-sidebar"
        aria-valuemin={SIDEBAR_WIDTH_MIN}
        aria-valuemax={SIDEBAR_WIDTH_MAX}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={(e) => endResize(e.currentTarget, true)}
        onPointerCancel={(e) => endResize(e.currentTarget, false)}
        onLostPointerCapture={(e) => endResize(e.currentTarget, true)}
        onKeyDown={onResizeKey}
        className="hover:bg-sidebar-border/60 focus-visible:bg-sidebar-border absolute inset-y-0 -right-1 z-30 hidden w-2 cursor-col-resize transition-colors focus-visible:outline-none md:block"
      />
    </Sidebar>
  );
}

// Compact sidebar card showing the rep's coupon for today: the code with a copy
// button, plus a used/remaining count against their daily budget.
function RepCouponCard({ coupon }: { coupon: RepCouponView }) {
  const fmtMoney = useFormatMoney();
  const { copied, copy: copyText } = useCopy(1500);
  const copy = () => copyText(coupon.code);

  const reached = coupon.used >= coupon.total;
  const ceiling = [
    coupon.capPct != null ? `${coupon.capPct}%` : null,
    coupon.capAmount != null ? `${fmtMoney(coupon.capAmount)}` : null,
  ].filter(Boolean).join(" / ");

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="gap-1.5">
        <TicketPercentIcon className="size-3.5" aria-hidden />
        Today&apos;s discount coupon
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="bg-sidebar-accent/40 grid gap-2 rounded-lg border p-2.5">
          <div className="flex items-center gap-1.5">
            <code className="bg-background flex-1 break-all rounded-md border px-2 py-1.5 font-mono text-xs tabular-nums">
              {coupon.code}
            </code>
            <button
              type="button"
              onClick={copy}
              aria-label={copied ? "Coupon code copied" : "Copy coupon code"}
              className={cn(
                "text-muted-foreground hover:text-foreground hover:bg-accent flex size-10 shrink-0 items-center justify-center rounded-md border",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
              )}
            >
              {copied ? (
                <CheckIcon className="size-4 text-ok" aria-hidden />
              ) : (
                <CopyIcon className="size-4" aria-hidden />
              )}
            </button>
            <span role="status" aria-live="polite" className="sr-only">
              {copied ? "Coupon code copied" : ""}
            </span>
          </div>
          {reached ? (
            <p className="text-muted-foreground text-xs">Daily limit reached</p>
          ) : (
            <p className="text-xs">
              <span className="tabular-nums font-medium">{coupon.used}</span>
              <span className="text-muted-foreground"> of </span>
              <span className="tabular-nums font-medium">{coupon.total}</span>
              <span className="text-muted-foreground"> used today</span>
            </p>
          )}
          {ceiling && (
            <p className="text-muted-foreground text-xs tabular-nums">up to {ceiling}</p>
          )}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
