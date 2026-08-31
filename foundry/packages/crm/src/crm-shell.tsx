import type { ReactNode } from "react";
import { cn } from "@foundry/ui/cn";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@foundry/ui/sidebar";
import { Separator } from "@foundry/ui/separator";
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
  chrome = "crm",
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
  /** Customer mobile uses floating glass chrome; admin stays a solid CRM bar. */
  chrome?: "crm" | "glass";
  children: ReactNode;
}) {
  const mobileBrand = hideSidebarOnMobile && brand;
  const glass = chrome === "glass";

  return (
    <SidebarProvider>
      {hideSidebarOnMobile ? (
        <DesktopOnlySidebar>{sidebar}</DesktopOnlySidebar>
      ) : (
        sidebar
      )}
      <SidebarInset>
        <header
          className={cn(
            "flex shrink-0 items-center gap-2 px-4",
            glass ? "h-16 md:h-14" : "h-14",
            glass
              ? cn(
                  "sticky top-0 z-30",
                  "max-md:border-b-0 max-md:bg-background/55 max-md:backdrop-blur-2xl max-md:backdrop-saturate-150",
                  "max-md:shadow-[inset_0_-1px_0_rgba(255,255,255,0.45)]",
                  "dark:max-md:bg-background/40 dark:max-md:shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]",
                  "md:border-b",
                  "[@media(prefers-reduced-transparency:reduce)]:bg-background [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none",
                )
              : "border-b",
          )}
        >
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
        {center ? (
          <div
            className={cn(
              "px-4 py-2 md:hidden",
              glass
                ? "border-b-0 bg-background/40 backdrop-blur-xl dark:bg-background/30"
                : "border-b",
            )}
          >
            {center}
          </div>
        ) : null}
        <div className={cn("flex-1 p-6 md:pb-6", glass ? "pb-36" : "pb-28")}>{children}</div>
      </SidebarInset>
      {bottomNav}
      {footer}
    </SidebarProvider>
  );
}
