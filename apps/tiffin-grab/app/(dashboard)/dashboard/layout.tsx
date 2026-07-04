import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { NotFoundError, zonedDateIso } from "@realm/commons";
import { getSession } from "@/lib/auth/session";
import { isLocked } from "@/lib/auth/lock";
import { getDiscountPolicy } from "@/lib/services/app-settings.service";
import { couponsService, type RepCouponToday } from "@/lib/services/coupons.service";
import { usersService } from "@/lib/services/users.service";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { GlobalSearch } from "@/components/dashboard/global-search";
import { IdleLock } from "@/components/dashboard/idle-lock";
import { LockButton } from "@/components/dashboard/lock-button";
import { Breadcrumbs } from "@realm/design-system";
import { labelForSegment } from "@/components/ds/route-labels";
import { ModeToggle } from "@/components/mode-toggle";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { CrmShell } from "@realm/crm";

// Any authenticated user reaches the shell; the sidebar filters nav by role and
// staff/admin-only pages self-guard (requireStaff/requireAdmin). Customers use
// it for the account page.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  // One read covers PIN state + the header avatar (name/image). A session can
  // outlive its user row (e.g. dev DB reseeded) — treat that as expired.
  let user;
  try {
    user = await usersService.read(session.user.id);
  } catch (err) {
    if (err instanceof NotFoundError) redirect("/login");
    throw err;
  }
  const hasPin = Boolean(user.pinHash);
  if (hasPin && (await isLocked())) redirect("/lock");

  const role = session.user.role;
  const email = user.email ?? session.user.email ?? "";

  // Sales reps (role member) get today's daily-coupon card in the sidebar, but
  // only when the allowance is on and this rep is not disabled. publicId is the
  // session id; the service resolves it to the internal owner id server-side.
  let repCoupon: RepCouponToday | null = null;
  if (role === "member") {
    const policy = await getDiscountPolicy();
    const override = policy.repDaily.perRep[session.user.id];
    const repActive = !(override && override.active === false);
    if (policy.repDaily.enabled && repActive) {
      const istDate = zonedDateIso(Date.now(), "Asia/Kolkata");
      repCoupon = await couponsService.getTodayRepCoupon(session.user.id, istDate);
    }
  }

  return (
    <CrmShell
      sidebar={
        <AppSidebar
          user={{ email, role, name: user.name ?? null, image: user.image ?? null }}
          hasPin={hasPin}
          repCoupon={repCoupon}
        />
      }
      breadcrumbs={<Breadcrumbs resolveLabel={labelForSegment} />}
      actions={
        <>
          <GlobalSearch role={role} />
          <NotificationBell />
          <LockButton hasPin={hasPin} />
          <ModeToggle />
        </>
      }
      footer={hasPin ? <IdleLock /> : null}
    >
      {children}
    </CrmShell>
  );
}
