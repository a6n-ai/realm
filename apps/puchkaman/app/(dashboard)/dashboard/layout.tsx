import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Role } from "@realm/commons";
import { resolveStatuses } from "@realm/crm/server";
import { Toaster } from "@realm/ui/sonner";
import { TooltipProvider } from "@realm/ui/tooltip";
import { CrmShell } from "@realm/crm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { PLUGINS } from "@/lib/plugins.server";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { AppBreadcrumbs } from "@/components/dashboard/app-breadcrumbs";
import { AppBrand } from "@/components/dashboard/app-brand";
import { AppBottomNav } from "@/components/dashboard/app-bottom-nav";
import { ModeToggle } from "@/components/mode-toggle";
import { NotificationBellMount } from "@/components/dashboard/notification-bell-mount";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  // A customer here is a wrong turn, not an intrusion — sending them to /login
  // would loop, because /login sees their valid session and sends them back.
  if (session.user.role === Role.USER) redirect("/me");
  // Every page below this layout calls requireAdmin, which throws ForbiddenError
  // with no error boundary to catch it. `member` is invitable but has no console
  // pages yet, so it gets an honest explainer instead of a 500.
  if (session.user.role !== Role.ADMIN) redirect("/no-access");

  // First-login gate: an account still on its issued default password must set
  // its own before it can reach anything under /dashboard. /set-password sits
  // outside this layout so it can't trap the user.
  const [u, statuses] = await Promise.all([
    db
      .select({ passwordSet: users.passwordSet, name: users.name, status: users.status })
      .from(users)
      .where(eq(users.publicId, session.user.id))
      .limit(1)
      .then((rows) => rows[0]),
    resolveStatuses(PLUGINS),
  ]);
  if (!u) redirect("/login");
  // Re-check status on the read path: the session.create.before hook stops a
  // suspended account signing IN, but a session issued before the suspension
  // would otherwise stay usable until it expires.
  if (u.status !== "active") redirect("/login?suspended=1");
  if (!u.passwordSet) redirect("/set-password");

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
            />
          }
          breadcrumbs={<AppBreadcrumbs />}
          actions={
            <>
              <NotificationBellMount userPublicId={session.user.id} />
              <ModeToggle />
            </>
          }
          bottomNav={<AppBottomNav statuses={statuses} />}
        >
          {children}
        </CrmShell>
        <Toaster position="top-right" />
      </TooltipProvider>
    </div>
  );
}
