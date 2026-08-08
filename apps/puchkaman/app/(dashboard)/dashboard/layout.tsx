import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
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

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

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
              user={{ email: session.user.email, name: u.name ?? null }}
              statuses={statuses}
            />
          }
          breadcrumbs={<AppBreadcrumbs />}
          actions={<ModeToggle />}
          bottomNav={<AppBottomNav statuses={statuses} />}
        >
          {children}
        </CrmShell>
        <Toaster position="top-right" />
      </TooltipProvider>
    </div>
  );
}
