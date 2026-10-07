import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { Role } from "@foundry/commons";
import { CrmShell } from "@foundry/crm";
import { Toaster } from "@foundry/ui/sonner";
import { TooltipProvider } from "@foundry/ui/tooltip";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { landingPathFor } from "@/lib/auth/landing";
import { getSession } from "@/lib/auth/session";
import { InviteBanner } from "@/components/customer/invite-banner";
import { CustomerNav } from "@/components/customer/customer-nav";
import { CustomerBottomNav } from "@/components/customer/customer-bottom-nav";
import { CustomerBrand } from "@/components/customer/customer-brand";
import { CustomerHeaderActions } from "@/components/customer/customer-header-actions";
import { TimezoneProvider } from "@/components/providers/timezone-provider";
import { getAppClock } from "@/lib/services/app-settings.service";
import { friendsService } from "@/lib/services/friends.service";
import { walletService } from "@/lib/services/wallet.service";
import { REF_COOKIE } from "@/lib/friends/ref-cookie";
import "@/app/customer.css";

export const dynamic = "force-dynamic";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  variable: "--font-xl-display",
});

const body = DM_Sans({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  variable: "--font-xl-body",
});

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
  const [{ timezone }, jar, wallet] = await Promise.all([
    getAppClock(),
    cookies(),
    walletService.coinsForFamily(session.user.id).catch(() => null),
    // Customers are created on several paths (signup, booking, staff); the
    // first /me load is the one place all of them pass, so usernames start here.
    friendsService.ensureUsername(session.user.id).catch((e) => console.error("ensureUsername", e)),
  ]);

  const ref = jar.get(REF_COOKIE)?.value;
  const invite = ref ? await friendsService.previewInvite(session.user.id, ref) : undefined;

  return (
    <div className={`crm-app customer-app ${display.variable} ${body.variable}`}>
      <TimezoneProvider tz={timezone}>
        <TooltipProvider>
          <CrmShell
            hideSidebarOnMobile
            brand={<CustomerBrand href="/me" />}
            sidebar={<CustomerNav />}
            actions={<CustomerHeaderActions coinBalance={wallet?.balance ?? null} />}
            bottomNav={<CustomerBottomNav />}
          >
            {invite !== undefined ? <InviteBanner inviter={invite} /> : null}
            {children}
          </CrmShell>
          <Toaster position="top-right" />
        </TooltipProvider>
      </TimezoneProvider>
    </div>
  );
}
