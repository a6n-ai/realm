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
  children,
}: {
  sidebar: ReactNode;
  breadcrumbs?: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      {sidebar}
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          {breadcrumbs}
          {center && <div className="flex flex-1 justify-center px-4">{center}</div>}
          {actions && <div className={`flex items-center gap-1${center ? "" : " ml-auto"}`}>{actions}</div>}
        </header>
        <div className="flex-1 p-6">{children}</div>
      </SidebarInset>
      {footer}
    </SidebarProvider>
  );
}
