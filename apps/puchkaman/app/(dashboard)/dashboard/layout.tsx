import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCloverConnection } from "@realm/clover";
import { Toaster } from "@realm/ui/sonner";
import { TooltipProvider } from "@realm/ui/tooltip";
import { CrmShell } from "@realm/crm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { AppBreadcrumbs } from "@/components/dashboard/app-breadcrumbs";
import { AppBrand } from "@/components/dashboard/app-brand";
import { AppBottomNav } from "@/components/dashboard/app-bottom-nav";
import { ModeToggle } from "@/components/mode-toggle";
import { integrationsConfigStore } from "@/lib/services/integrations.service";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  // First-login gate: an account still on its issued default password must set
  // its own before it can reach anything under /dashboard. /set-password sits
  // outside this layout so it can't trap the user.
  const [u, clover] = await Promise.all([
    db
      .select({ passwordSet: users.passwordSet, name: users.name })
      .from(users)
      .where(eq(users.publicId, session.user.id))
      .limit(1)
      .then((rows) => rows[0]),
    getCloverConnection(integrationsConfigStore),
  ]);
  if (!u) redirect("/login");
  if (!u.passwordSet) redirect("/set-password");

  const cloverInstalled = Boolean(clover.installed);
  const cloverConnected = Boolean(clover.connected && clover.merchantId);

  return (
    <div className="crm-app">
      <TooltipProvider>
        <CrmShell
          hideSidebarOnMobile
          brand={<AppBrand href="/dashboard" />}
          sidebar={
            <AppSidebar
              user={{ email: session.user.email, name: u.name ?? null }}
              cloverInstalled={cloverInstalled}
              cloverConnected={cloverConnected}
            />
          }
          breadcrumbs={<AppBreadcrumbs />}
          actions={<ModeToggle />}
          bottomNav={
            <AppBottomNav
              cloverInstalled={cloverInstalled}
              cloverConnected={cloverConnected}
            />
          }
        >
          {children}
        </CrmShell>
        <Toaster position="top-right" />
      </TooltipProvider>
    </div>
  );
}
