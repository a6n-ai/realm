import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Role } from "@foundry/commons";
import { resolveStatuses } from "@foundry/crm/server";
import { CLOVER_PLUGIN_ID } from "@foundry/clover/plugin";
import { Toaster } from "@foundry/ui/sonner";
import { TooltipProvider } from "@foundry/ui/tooltip";
import { CrmShell } from "@foundry/crm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { grantedKeys } from "@/lib/auth/nav-permissions";
import { getMemberOrganizations } from "@/lib/services/organizations.service";
import { isCloverVisibleInNav } from "@/lib/services/integrations.service";
import { PLUGINS } from "@/lib/plugins.server";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { AppBreadcrumbs } from "@/components/dashboard/app-breadcrumbs";
import { AppBrand } from "@/components/dashboard/app-brand";
import { AppBottomNav } from "@/components/dashboard/app-bottom-nav";
import { ModeToggle } from "@/components/mode-toggle";
import { NotificationBellMount } from "@/components/dashboard/notification-bell-mount";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";

// Every page under here is auth-gated (getSession() reads headers()), so none can
// ever actually be static — this stops Next from wastefully rendering all of them
// once at build time only to discard the result.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  // A customer here is a wrong turn, not an intrusion — sending them to /login
  // would loop, because /login sees their valid session and sends them back.
  if (session.user.role === Role.USER) redirect("/me");
  // Any future staff role with no pages of its own still gets the explainer
  // rather than a 403 from the first component that tries to load data.
  if (session.user.role !== Role.ADMIN && session.user.role !== Role.MEMBER) redirect("/no-access");

  // First-login gate: an account still on its issued default password must set
  // its own before it can reach anything under /dashboard. /set-password sits
  // outside this layout so it can't trap the user.
  const [u, statuses, cloverVisibleInNav] = await Promise.all([
    db
      .select({ passwordSet: users.passwordSet, name: users.name, status: users.status })
      .from(users)
      .where(eq(users.publicId, session.user.id))
      .limit(1)
      .then((rows) => rows[0]),
    resolveStatuses(PLUGINS),
    isCloverVisibleInNav(),
  ]);
  if (!u) redirect("/login");
  // A brand admin with no direct Clover connection of its own still manages
  // every franchise's Clover catalog — see isCloverVisibleInNav. Settings'
  // own status card is untouched by this; it still correctly reports the
  // active org's own connection.
  if (cloverVisibleInNav && !statuses[CLOVER_PLUGIN_ID]?.installed) {
    statuses[CLOVER_PLUGIN_ID] = { ...statuses[CLOVER_PLUGIN_ID], installed: true };
  }
  // Re-check status on the read path: the session.create.before hook stops a
  // suspended account signing IN, but a session issued before the suspension
  // would otherwise stay usable until it expires.
  if (u.status !== "active") redirect("/login?suspended=1");
  if (!u.passwordSet) redirect("/set-password");

  const granted = grantedKeys(session.user.role);
  const memberOrganizations = await getMemberOrganizations(session);

  return (
    <div className="crm-app">
      <TooltipProvider>
        <CrmShell
          hideSidebarOnMobile
          brand={<AppBrand href="/dashboard" />}
          sidebar={
            <AppSidebar
              user={{ email: session.user.email, name: u.name ?? null, role: session.user.role }}
              statuses={statuses}
              granted={granted}
            />
          }
          breadcrumbs={<AppBreadcrumbs />}
          actions={
            <>
              <OrgSwitcher organizations={memberOrganizations} activeOrganizationId={session.session.activeOrganizationId} />
              <NotificationBellMount userPublicId={session.user.id} />
              <ModeToggle />
            </>
          }
          bottomNav={<AppBottomNav statuses={statuses} granted={granted} />}
        >
          {children}
        </CrmShell>
        <Toaster position="top-right" />
      </TooltipProvider>
    </div>
  );
}
