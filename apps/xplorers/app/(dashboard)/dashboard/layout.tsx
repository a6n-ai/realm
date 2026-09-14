import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Role } from "@foundry/commons";
import { Toaster } from "@foundry/ui/sonner";
import { TooltipProvider } from "@foundry/ui/tooltip";
import { CrmShell } from "@foundry/crm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { grantedKeys } from "@/lib/auth/nav-permissions";
import { getMemberOrganizations } from "@/lib/services/organizations.service";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { AppBreadcrumbs } from "@/components/dashboard/app-breadcrumbs";
import { AppBrand } from "@/components/dashboard/app-brand";
import { AppBottomNav } from "@/components/dashboard/app-bottom-nav";
import { ModeToggle } from "@/components/mode-toggle";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (session.user.role === Role.USER) redirect("/me");
  if (session.user.role !== Role.ADMIN && session.user.role !== Role.MEMBER) redirect("/no-access");

  const [u] = await db
    .select({ passwordSet: users.passwordSet, name: users.name, status: users.status })
    .from(users)
    .where(eq(users.publicId, session.user.id))
    .limit(1);
  if (!u) redirect("/login");
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
              granted={granted}
            />
          }
          breadcrumbs={<AppBreadcrumbs />}
          actions={
            <>
              <OrgSwitcher organizations={memberOrganizations} activeOrganizationId={session.session.activeOrganizationId} />
              <ModeToggle />
            </>
          }
          bottomNav={<AppBottomNav granted={granted} />}
        >
          {children}
        </CrmShell>
        <Toaster position="top-right" />
      </TooltipProvider>
    </div>
  );
}
