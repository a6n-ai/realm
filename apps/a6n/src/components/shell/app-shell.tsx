import { activeItem, type NavGroup } from "@foundry/console/nav";
import { ConsoleLink, useConsoleRouter } from "@foundry/console/router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@foundry/ui/sidebar";
import { Fragment, type ReactNode, useEffect } from "react";

function CloseOnNavigate() {
  const pathname = useConsoleRouter().usePathname();
  const { setOpenMobile } = useSidebar();
  useEffect(() => setOpenMobile(false), [pathname, setOpenMobile]);
  return null;
}

function Groups({ nav }: { nav: NavGroup[] }) {
  const router = useConsoleRouter();
  const pathname = router.usePathname();
  const search = router.useSearch();
  // "Unassigned" is the inquiries list with a view; it is current only when that view is showing.
  const view = search.view === "unassigned";
  const active = activeItem(nav, pathname);
  const isCurrent = (item: NavGroup["items"][number]) => {
    if (item.to.startsWith("/inquiries?view=")) return pathname === "/inquiries" && view;
    if (item.to === "/inquiries") return pathname.startsWith("/inquiries") && !(pathname === "/inquiries" && view);
    return item === active;
  };
  return (
    <nav aria-label="Primary">
      {nav.map((group, i) => (
        <Fragment key={i}>
          {i > 0 ? <SidebarSeparator /> : null}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const current = isCurrent(item);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton isActive={current} tooltip={item.label} render={<ConsoleLink to={item.to} aria-current={current ? "page" : undefined} />}>
                        {item.icon ? <item.icon /> : null}
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.badge != null ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </Fragment>
      ))}
    </nav>
  );
}

export function AppShell({ nav, brand, find, userMenu, children }: { nav: NavGroup[]; brand: ReactNode; find: ReactNode; userMenu: ReactNode; children: ReactNode }) {
  return (
    <>
      <a
        href="#console-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
      >
        Skip to content
      </a>
      <SidebarProvider>
        <CloseOnNavigate />
        <Sidebar collapsible="icon" variant="inset">
          <SidebarHeader>
            {brand}
            {find}
          </SidebarHeader>
          <SidebarContent className="overflow-x-hidden">
            <Groups nav={nav} />
          </SidebarContent>
          <SidebarFooter>{userMenu}</SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset id="console-main" tabIndex={-1} className="focus:outline-none">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,72rem)_minmax(0,1fr)] [&>:not(header)]:col-start-2 [&>:not(header)]:min-w-0 [&>header]:col-span-full">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}
