import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
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
import { ClaimInvite } from "@/components/customer/claim-invite";
import { CustomerNav } from "@/components/customer/customer-nav";
import { CustomerBottomNav } from "@/components/customer/customer-bottom-nav";
import { AppBrand } from "@/components/dashboard/app-brand";
import { ModeToggle } from "@/components/mode-toggle";
import { TimezoneProvider } from "@/components/providers/timezone-provider";
import { getAppClock } from "@/lib/services/app-settings.service";
import { friendsService } from "@/lib/services/friends.service";
import { REF_COOKIE } from "@/lib/friends/ref-cookie";

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
  const [{ timezone }, jar] = await Promise.all([
    getAppClock(),
    cookies(),
    // Customers are created on several paths (signup, booking, staff); the
    // first /me load is the one place all of them pass, so usernames start here.
    friendsService.ensureUsername(session.user.id).catch((e) => console.error("ensureUsername", e)),
  ]);

  return (
    <div className="crm-app">
      <TimezoneProvider tz={timezone}>
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
          {jar.has(REF_COOKIE) ? <ClaimInvite /> : null}
          <Toaster position="top-right" />
        </TooltipProvider>
      </TimezoneProvider>
    </div>
  );
}
