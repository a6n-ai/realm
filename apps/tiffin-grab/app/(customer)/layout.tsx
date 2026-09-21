import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { NotFoundError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { usersService } from "@/lib/services/users.service";
import { walletService } from "@/lib/services/wallet.service";
import { CustomerShell } from "@/components/customer/shell/customer-shell";
import { TimezoneProvider } from "@/components/providers/timezone-provider";

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

  return (
    <div className="crm-app customer-app">
      <TimezoneProvider tz={timezone}>
        <CustomerShell coinBalance={coinBalance}>{children}</CustomerShell>
      </TimezoneProvider>
    </div>
  );
}
