import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { NotFoundError } from "@foundry/commons";
import { CrmShell } from "@foundry/crm";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { usersService } from "@/lib/services/users.service";
import { walletService } from "@/lib/services/wallet.service";
import { TimezoneProvider } from "@/components/providers/timezone-provider";
import { CustomerBottomNav } from "@/components/customer/customer-bottom-nav";
import { CustomerSidebar } from "@/components/customer/customer-sidebar";
import { CustomerSearch } from "@/components/customer/customer-search";
import { CustomerHeaderActions } from "@/components/customer/customer-header-actions";
import { AppBrand } from "@/components/app-brand";

// Every page under here is auth-gated (getSession() reads headers()), so none can
// ever actually be static — this stops Next from wastefully rendering all of them
// once at build time only to discard the result.
export const dynamic = "force-dynamic";

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "user") redirect("/dashboard");

  let user;
  try {
    user = await usersService.read(session.user.id);
  } catch (err) {
    if (err instanceof NotFoundError) redirect("/login");
    throw err;
  }

  // Same read-path status re-check as the staff shell: a suspension must end the
  // session already in flight, not only block the next sign-in.
  if ((user as { status?: string }).status !== "active") redirect("/login?suspended=1");

  const [{ timezone }, coinBalance] = await Promise.all([
    getAppSettings(),
    walletService.balance(user.id),
  ]);
  const email = user.email ?? session.user.email ?? "";

  return (
    <TimezoneProvider tz={timezone}>
      <CrmShell
        chrome="glass"
        hideSidebarOnMobile
        brand={<AppBrand href="/me" subtitle="Meals" />}
        sidebar={<CustomerSidebar user={{ name: user.name ?? null, email, image: user.image ?? null }} />}
        center={<CustomerSearch />}
        actions={
          <CustomerHeaderActions
            user={{ name: user.name ?? null, email, image: user.image ?? null }}
            coinBalance={coinBalance}
          />
        }
        bottomNav={<CustomerBottomNav />}
      >
        {children}
      </CrmShell>
    </TimezoneProvider>
  );
}
