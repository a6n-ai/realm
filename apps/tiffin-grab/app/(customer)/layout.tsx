import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { NotFoundError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { usersService } from "@/lib/services/users.service";
import { walletService } from "@/lib/services/wallet.service";
import { ticketsService } from "@/lib/services/tickets.service";
import { CustomerShell } from "@/components/customer/shell/customer-shell";
import { InviteBanner } from "@/components/customer/friends/invite-banner";
import { REF_COOKIE } from "@/lib/friends/ref-cookie";
import { friendsService } from "@/lib/services/friends.service";
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

  const [{ timezone }, coinBalance, staffReplies, jar] = await Promise.all([
    getAppSettings(),
    walletService.balance(user.id),
    ticketsService.latestStaffReplies(user.id),
    cookies(),
    // Customers are created on several paths (signup, checkout, staff, Google);
    // the first /me load is the one place all of them pass, so usernames start here.
    friendsService.ensureUsername(session.user.id).catch((e) => console.error("ensureUsername", e)),
  ]);
  const ref = jar.get(REF_COOKIE)?.value;
  const invite = ref ? await friendsService.previewInvite(session.user.id, ref) : undefined;

  return (
    <div className="crm-app customer-app">
      <TimezoneProvider tz={timezone}>
        <CustomerShell coinBalance={coinBalance} userPublicId={user.publicId} staffReplies={staffReplies}>
          {invite !== undefined ? <InviteBanner inviter={invite} /> : null}
          {children}
        </CustomerShell>
      </TimezoneProvider>
    </div>
  );
}
