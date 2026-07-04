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
  actions,
  footer,
  children,
}: {
  sidebar: ReactNode;
  breadcrumbs?: ReactNode;
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
          {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
        </header>
        <div className="flex-1 p-6">{children}</div>
      </SidebarInset>
      {footer}
    </SidebarProvider>
  );
}
