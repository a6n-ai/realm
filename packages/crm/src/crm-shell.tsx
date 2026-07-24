import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@realm/ui/sidebar";
import { Separator } from "@realm/ui/separator";
import { DesktopOnlySidebar } from "./desktop-only-sidebar";

// The reusable CRM shell scaffold: sidebar + inset + header frame. Every piece
// with a client's own vocabulary (the sidebar contents, header actions, the
// breadcrumb label source, any locked-idle footer) is passed in as a slot, so
// this stays free of app services and nav config. A Server Component — it only
// composes; the injected slots carry their own "use client" where needed.
export function CrmShell({
  sidebar,
  brand,
  breadcrumbs,
  center,
  actions,
  footer,
  bottomNav,
  hideSidebarOnMobile = false,
  children,
}: {
  sidebar: ReactNode;
  /** Shown top-left on mobile when the sidebar (and its trigger) are hidden. */
  brand?: ReactNode;
  breadcrumbs?: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  bottomNav?: ReactNode;
  hideSidebarOnMobile?: boolean;
  children: ReactNode;
}) {
  const mobileBrand = hideSidebarOnMobile && brand;

  return (
    <SidebarProvider>
      {hideSidebarOnMobile ? (
        <DesktopOnlySidebar>{sidebar}</DesktopOnlySidebar>
      ) : (
        sidebar
      )}
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          {mobileBrand ? (
            <div className="min-w-0 flex-1 md:hidden">{brand}</div>
          ) : null}
          <SidebarTrigger
            className={hideSidebarOnMobile ? "max-md:hidden -ml-1" : "-ml-1"}
          />
          <Separator
            orientation="vertical"
            className={
              mobileBrand
                ? "mr-2 hidden h-4 md:block"
                : "mr-2 hidden h-4 sm:block"
            }
          />
          <div className={mobileBrand ? "hidden md:block" : "hidden sm:block"}>
            {breadcrumbs}
          </div>
          {center ? (
            <div className="hidden flex-1 justify-center px-4 md:flex">{center}</div>
          ) : null}
          {actions ? (
            <div
              className={
                center
                  ? "ml-auto flex shrink-0 items-center gap-1 md:ml-0"
                  : "ml-auto flex shrink-0 items-center gap-1"
              }
            >
              {actions}
            </div>
          ) : null}
        </header>
        {center ? <div className="border-b px-4 py-2 md:hidden">{center}</div> : null}
        <div className="flex-1 p-6 pb-28 md:pb-6">{children}</div>
      </SidebarInset>
      {bottomNav}
      {footer}
    </SidebarProvider>
  );
}
