import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { NotFoundError } from "@realm/commons";
import { CrmShell } from "@realm/crm";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { usersService } from "@/lib/services/users.service";
import { TimezoneProvider } from "@/components/providers/timezone-provider";
import { CustomerBottomNav } from "@/components/customer/customer-bottom-nav";
import { CustomerSidebar } from "@/components/customer/customer-sidebar";
import { CustomerSearch } from "@/components/customer/customer-search";
import { CustomerProfileMenu } from "@/components/customer/customer-profile-menu";
import { hasLiveSubscription } from "@/lib/services/customer-deliveries.service";
import { currentUserId } from "@/lib/services/session-service";

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "user") redirect("/dashboard"); // staff/admin use the CRM

  // One read covers the sidebar header (name/image) — session only carries
  // id/role/email. A session can outlive its user row (e.g. dev DB reseeded).
  let user;
  try {
    user = await usersService.read(session.user.id);
  } catch (err) {
    if (err instanceof NotFoundError) redirect("/login");
    throw err;
  }

  const { timezone } = await getAppSettings();
  const email = user.email ?? session.user.email ?? "";
  const userId = await currentUserId();
  const hasLivePlan = userId != null ? await hasLiveSubscription(userId) : false;

  return (
    <TimezoneProvider tz={timezone}>
      <CrmShell
        sidebar={<CustomerSidebar user={{ name: user.name ?? null, email, image: user.image ?? null }} />}
        center={<CustomerSearch />}
        actions={<CustomerProfileMenu user={{ name: user.name ?? null, email, image: user.image ?? null }} />}
        bottomNav={<CustomerBottomNav hasLivePlan={hasLivePlan} />}
      >
        {children}
      </CrmShell>
    </TimezoneProvider>
  );
}
