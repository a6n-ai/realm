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

// Every page under here is auth-gated (getSession() reads headers()), so none can
// ever actually be static — this stops Next from wastefully rendering all of them
// once at build time only to discard the result.
export const dynamic = "force-dynamic";

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=/me");
  // Staff have their own console; sending them here would hide the tools they
  // signed in for behind a customer shell. `member` is a real console role now,
  // so route by role rather than dead-ending every non-admin staffer on
  // /no-access — a member following a /me link does have somewhere to go.
  // /no-access stays the answer for a role with no home but this one.
  const home = landingPathFor(session.user.role);
  if (home !== "/me") redirect(home);
  if (session.user.role !== Role.USER) redirect("/no-access");

  const [u] = await db
    .select({ name: users.name, status: users.status })
    .from(users)
    .where(eq(users.publicId, session.user.id))
    .limit(1);
  if (!u) redirect("/login");
  // Re-check on the read path: the sign-in gate stops a suspended account
  // getting a session, but one issued before the suspension stays usable.
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
