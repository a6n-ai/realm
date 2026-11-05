"use client";

import type { ComponentProps, ReactNode } from "react";
import { MotionProvider } from "@/components/motion/motion-provider";
import { AppBottomNav } from "@/components/dashboard/app-bottom-nav";
import { AppBreadcrumbs, BreadcrumbLabelsProvider } from "@/components/dashboard/app-breadcrumbs";
import { AppClock } from "@/components/dashboard/app-clock";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { GlobalSearch } from "@/components/dashboard/global-search";
import { IdleLock } from "@/components/dashboard/idle-lock";
import { InboxRealtime } from "@/components/dashboard/inbox-realtime";
import { LockButton } from "@/components/dashboard/lock-button";
import { NotificationBellMount } from "@/components/dashboard/notification-bell-mount";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { QuickAddProvider } from "@/components/dashboard/quick-add-provider";
import { RepCodeFab } from "@/components/dashboard/rep-code-fab";
import { ModeToggle } from "@/components/mode-toggle";
import { TimezoneProvider } from "@/components/providers/timezone-provider";

// One client module for the whole admin shell. The server layout used to import
// each of these itself, and Turbopack then copied that module's chunk list into
// every dashboard page manifest.
export function DashboardProviders({ tz, children }: { tz: string; children: ReactNode }) {
  return (
    <TimezoneProvider tz={tz}>
      <MotionProvider>
        <QuickAddProvider>
          <BreadcrumbLabelsProvider>{children}</BreadcrumbLabelsProvider>
        </QuickAddProvider>
      </MotionProvider>
    </TimezoneProvider>
  );
}

export function DashboardSidebar(props: ComponentProps<typeof AppSidebar>) {
  return <AppSidebar {...props} />;
}

export function DashboardSearch({ role }: { role: string }) {
  return <GlobalSearch role={role} />;
}

export function DashboardBreadcrumbs() {
  return <AppBreadcrumbs />;
}

export function DashboardActions({
  cutoffHour,
  organizations,
  activeOrganizationId,
  userPublicId,
  notifications,
  hasPin,
}: {
  cutoffHour: number;
  organizations: ComponentProps<typeof OrgSwitcher>["organizations"];
  activeOrganizationId: string | null;
  userPublicId: string;
  notifications: ComponentProps<typeof NotificationBellMount>["initial"];
  hasPin: boolean;
}) {
  return (
    <>
      <AppClock cutoffHour={cutoffHour} />
      <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
      <NotificationBellMount userPublicId={userPublicId} initial={notifications} />
      <LockButton hasPin={hasPin} />
      <ModeToggle />
    </>
  );
}

export function DashboardFooter({ hasPin }: { hasPin: boolean }) {
  return hasPin ? <IdleLock /> : null;
}

export function DashboardBottomNav({ role }: { role: string }) {
  return <AppBottomNav role={role} />;
}

export function DashboardLive({ payments, showRepCode }: { payments: boolean; showRepCode: boolean }) {
  return (
    <>
      <InboxRealtime tickets payments={payments} />
      {showRepCode ? <RepCodeFab /> : null}
    </>
  );
}
