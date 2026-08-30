import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { NotFoundError, zonedDateIso } from "@realm/commons";
import { getSession } from "@/lib/auth/session";
import { isLocked } from "@/lib/auth/lock";
import { getAppSettings, getDiscountPolicy } from "@/lib/services/app-settings.service";
import { getMemberOrganizations } from "@/lib/services/organizations.service";
import { couponsService, type RepCouponToday } from "@/lib/services/coupons.service";
import { usersService } from "@/lib/services/users.service";
import { newActivity } from "@/lib/services/section-seen.service";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { GlobalSearch } from "@/components/dashboard/global-search";
import { IdleLock } from "@/components/dashboard/idle-lock";
import { LockButton } from "@/components/dashboard/lock-button";
import { AppBreadcrumbs } from "@/components/dashboard/app-breadcrumbs";
import { ModeToggle } from "@/components/mode-toggle";
import { NotificationBell } from "@realm/notifications/ui";
import { subscribeNotifications } from "@/components/notifications/realtime";
import { CrmShell } from "@realm/crm";
import { QuickAddProvider } from "@/components/dashboard/quick-add-provider";
import { TimezoneProvider } from "@/components/providers/timezone-provider";
import { AppBottomNav } from "@/components/dashboard/app-bottom-nav";
import { AppBrand } from "@/components/app-brand";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";

// Every page under here is auth-gated (getSession() reads headers()), so none can
// ever actually be static — this just stops Next from wastefully rendering all
// ~126 of them once at build time only to discard the result.
export const dynamic = "force-dynamic";

// Any authenticated user reaches the shell; the sidebar filters nav by role and
// staff/admin-only pages self-guard (requireStaff/requireAdmin). Customers use
// it for the account page.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  // Customers have their own app at /me — the CRM shell is staff/admin only.
  // This is the mirror of the (customer) layout's non-user → /dashboard guard,
  // and it also makes post-login push("/dashboard") land customers on /me.
  if (session.user.role === "user") redirect("/me");

  // One read covers PIN state + the header avatar (name/image). A session can
  // outlive its user row (e.g. dev DB reseeded) — treat that as expired.
  let user;
  try {
    user = await usersService.read(session.user.id);
  } catch (err) {
    if (err instanceof NotFoundError) redirect("/login");
    throw err;
  }
  // Re-check status on the read path. session.create.before only gates a session
  // being CREATED, so an account suspended mid-session would otherwise keep full
  // CRM access until the 30-day session expired. usersService.setStatus revokes
  // sessions too; this is the belt to that braces, covering any other path that
  // flips status. Mirrors puchkaman's dashboard layout.
  if ((user as { status?: string }).status !== "active") redirect("/login?suspended=1");

  // First-login gate: an account still on its issued default password must set
  // its own before it can reach anything under /dashboard (customers and staff
  // alike). /set-password sits outside this layout so it can't trap the user.
  if (!user.passwordSet) redirect("/set-password");

  const hasPin = Boolean(user.pinHash);
  if (hasPin && (await isLocked())) redirect("/login");

  const { timezone } = await getAppSettings();
  const memberOrganizations = await getMemberOrganizations(session);

  const role = session.user.role;
  const email = user.email ?? session.user.email ?? "";
  const activity = await newActivity();

  // Sales reps (role member) get today's daily-coupon card in the sidebar, but
  // only when the allowance is on and this rep is not disabled. publicId is the
  // session id; the service resolves it to the internal owner id server-side.
  let repCoupon: RepCouponToday | null = null;
  if (role === "member") {
    const policy = await getDiscountPolicy();
    const override = policy.repDaily.perRep[session.user.id];
    const repActive = !(override && override.active === false);
    if (policy.repDaily.enabled && repActive) {
      // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
      const istDate = zonedDateIso(Date.now(), "Asia/Kolkata");
      repCoupon = await couponsService.getTodayRepCoupon(session.user.id, istDate);
    }
  }

  return (
    <div className="crm-app">
    <TimezoneProvider tz={timezone}>
    <QuickAddProvider>
    <CrmShell
      hideSidebarOnMobile
      brand={<AppBrand href="/dashboard" subtitle="Operations" />}
      sidebar={
        <AppSidebar
          user={{ email, role, name: user.name ?? null, image: user.image ?? null }}
          hasPin={hasPin}
          repCoupon={repCoupon}
          activity={activity}
        />
      }
      breadcrumbs={<AppBreadcrumbs />}
      center={<GlobalSearch role={role} />}
      actions={
        <>
          <OrgSwitcher organizations={memberOrganizations} activeOrganizationId={session.session.activeOrganizationId} />
          <NotificationBell subscribe={subscribeNotifications} />
          <LockButton hasPin={hasPin} />
          <ModeToggle />
        </>
      }
      footer={hasPin ? <IdleLock /> : null}
      bottomNav={<AppBottomNav role={role} />}
    >
      {children}
    </CrmShell>
    </QuickAddProvider>
    </TimezoneProvider>
    </div>
  );
}
