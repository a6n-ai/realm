import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@realm/ui/sidebar";
import { Separator } from "@realm/ui/separator";

// The reusable CRM shell scaffold: sidebar + inset + header frame. Every piece
// with a client's own vocabulary (the sidebar contents, header actions, the
// breadcrumb label source, any locked-idle footer) is passed in as a slot, so
// this stays free of app services and nav config. A Server Component — it only
// composes; the injected slots carry their own "use client" where needed.
export function CrmShell({
  sidebar,
  breadcrumbs,
  center,
  actions,
  footer,
  bottomNav,
  children,
}: {
  sidebar: ReactNode;
  breadcrumbs?: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  bottomNav?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      {sidebar}
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          {/* Visible at every breakpoint: on mobile the shadcn sidebar renders as a
              Sheet (toggleSidebar flips openMobile), so this is the only way to
              reach any page not pinned to the bottom nav (e.g. Account/Meals). */}
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 hidden h-4 sm:block" />
          <div className="hidden sm:block">{breadcrumbs}</div>
          {center && <div className="hidden flex-1 justify-center px-4 md:flex">{center}</div>}
          {actions && <div className={`flex items-center gap-1${center ? " ml-auto md:ml-0" : " ml-auto"}`}>{actions}</div>}
        </header>
        {center && <div className="border-b px-4 py-2 md:hidden">{center}</div>}
        <div className="flex-1 p-6 pb-28 md:pb-6">{children}</div>
      </SidebarInset>
      {bottomNav}
      {footer}
    </SidebarProvider>
  );
}
