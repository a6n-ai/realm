import { isCustomerRole } from "@/lib/auth/roles";
import "@/app/styles/app.css";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { NotFoundError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { usersService } from "@/lib/services/users.service";
import { walletService } from "@/lib/wallet/wallet.service";
import { ticketsService } from "@/lib/services/tickets.service";
import { CustomerShell } from "@/components/customer/shell/customer-shell";
import { AppCurrencyProvider } from "@/components/app-currency";
import { TimezoneProvider } from "@foundry/design-system/timezone-provider";
import { MotionProvider } from "@/components/motion/motion-provider";
import { Suspense } from "react";
import { ReviewNudge } from "./me/review-nudge";
import { ConsentNudge } from "@/components/customer/consent-nudge";
import { mintRealtimeTokens } from "@/lib/realtime/mint";
import { notifyChannel } from "@/lib/realtime/notify";

// Every page under here is auth-gated (getSession() reads headers()), so none can
// ever actually be static — this stops Next from wastefully rendering all of them
// once at build time only to discard the result.
export const dynamic = "force-dynamic";

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (!isCustomerRole(session.user.role)) redirect("/dashboard");

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

  const notify = notifyChannel(user.publicId);
  const [{ timezone, cutoffHour, currency }, coinBalance, staffReplies, realtimeTokens] = await Promise.all([
    getAppSettings(),
    walletService.balance(user.id),
    ticketsService.latestStaffReplies(user.id),
    mintRealtimeTokens([notify]),
  ]);
  const coinValue = await walletService.moneyValue(coinBalance, currency);

  return (
    <div className="crm-app customer-app">
      <AppCurrencyProvider currency={currency}>
      <TimezoneProvider tz={timezone}>
        <MotionProvider>
          {/* Top-bar review request on every customer page; streams in, never blocks the shell. */}
          <Suspense fallback={null}><ReviewNudge /></Suspense>
          <ConsentNudge />
          <CustomerShell
            coinBalance={coinBalance}
            coinValue={coinValue}
            cutoffHour={cutoffHour}
            userPublicId={user.publicId}
            userName={user.name ?? null}
            userImage={user.image ?? null}
            staffReplies={staffReplies}
            notifyBootstrap={realtimeTokens[notify]}
          >
            {children}
          </CustomerShell>
        </MotionProvider>
      </TimezoneProvider>
      </AppCurrencyProvider>
    </div>
  );
}
