import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { TimezoneProvider } from "@/components/providers/timezone-provider";
import { CustomerBottomNav } from "@/components/customer/customer-bottom-nav";

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "user") redirect("/dashboard"); // staff/admin use the CRM

  const { timezone } = await getAppSettings();

  return (
    <TimezoneProvider tz={timezone}>
      <div className="mx-auto min-h-dvh max-w-md pb-16 md:max-w-5xl">{children}</div>
      <CustomerBottomNav />
    </TimezoneProvider>
  );
}
