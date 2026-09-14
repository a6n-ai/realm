import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Role } from "@foundry/commons";
import { CrmShell } from "@foundry/crm";
import { Toaster } from "@foundry/ui/sonner";
import { TooltipProvider } from "@foundry/ui/tooltip";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { landingPathFor } from "@/lib/auth/landing";
import { getSession } from "@/lib/auth/session";
import { CustomerNav } from "@/components/customer/customer-nav";
import { CustomerBottomNav } from "@/components/customer/customer-bottom-nav";
import { AppBrand } from "@/components/dashboard/app-brand";
import { ModeToggle } from "@/components/mode-toggle";

export const dynamic = "force-dynamic";

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=/me");
  const home = landingPathFor(session.user.role);
  if (home !== "/me") redirect(home);
  if (session.user.role !== Role.USER) redirect("/no-access");

  const [u] = await db
    .select({ name: users.name, status: users.status })
    .from(users)
    .where(eq(users.publicId, session.user.id))
    .limit(1);
  if (!u) redirect("/login");
  if (u.status !== "active") redirect("/login?suspended=1");

  return (
    <div className="crm-app">
      <TooltipProvider>
        <CrmShell
          hideSidebarOnMobile
          brand={<AppBrand href="/me" />}
          sidebar={<CustomerNav />}
          actions={<ModeToggle />}
          bottomNav={<CustomerBottomNav />}
        >
          {children}
        </CrmShell>
        <Toaster position="top-right" />
      </TooltipProvider>
    </div>
  );
}
