import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { NotFoundError, zonedDateIso } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { isLocked } from "@/lib/auth/lock";
import { getAppSettings, getDiscountPolicy } from "@/lib/services/app-settings.service";
import { getMemberOrganizations } from "@/lib/services/organizations.service";
import { couponsService, type RepCouponToday } from "@/lib/services/coupons.service";
import { repAllowanceFor } from "@/lib/services/rep-allowance";
import { RepCodeFab } from "@/components/dashboard/rep-code-fab";
import { usersService } from "@/lib/services/users.service";
import { newActivity } from "@/lib/services/section-seen.service";
import { getFeed } from "@/lib/notifications/feed";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { GlobalSearch } from "@/components/dashboard/global-search";
import { IdleLock } from "@/components/dashboard/idle-lock";
import { LockButton } from "@/components/dashboard/lock-button";
import { AppBreadcrumbs } from "@/components/dashboard/app-breadcrumbs";
import { ModeToggle } from "@/components/mode-toggle";
import { NotificationBellMount } from "@/components/dashboard/notification-bell-mount";
import { CrmShell } from "@foundry/crm";
import { QuickAddProvider } from "@/components/dashboard/quick-add-provider";
import { TimezoneProvider } from "@/components/providers/timezone-provider";
import { AppBottomNav } from "@/components/dashboard/app-bottom-nav";
import { AppBrand } from "@/components/app-brand";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { InboxRealtime } from "@/components/dashboard/inbox-realtime";
import { AppClock } from "@/components/dashboard/app-clock";
import { RoutePushBadge } from "@/components/dashboard/route-push-badge";

// Every page under here is auth-gated (getSession() reads headers()), so none can
// ever actually be static — this just stops Next from wastefully rendering all
// ~126 of them once at build time only to discard the result.
export const dynamic = "force-dynamic";

// This layout blocks first byte of every /dashboard page, so each read is timed
// and logged as one "[dashboard-timing]" line (CloudWatch /tiffin/prod) to show
// which one is slow. ponytail: logs every render; sample or drop once tuned.
function timer() {
  const start = performance.now();
  const ms: Record<string, number> = {};
  const elapsed = (from: number) => Math.round(performance.now() - from);
  return {
    timed<T>(label: string, p: Promise<T>): Promise<T> {
      const t = performance.now();
      return p.finally(() => {
        ms[label] = elapsed(t);
      });
    },
    log() {
      console.info(`[dashboard-timing] ${JSON.stringify({ total: elapsed(start), ...ms })}`);
    },
  };
}

// Any authenticated user reaches the shell; the sidebar filters nav by role and
// staff/admin-only pages self-guard (requireStaff/requireAdmin). Customers use
// it for the account page.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { timed, log } = timer();
  const session = await timed("session", getSession());
  if (!session?.user) redirect("/login");

  // Customers have their own app at /me — the CRM shell is staff/admin only.
  // This is the mirror of the (customer) layout's non-user → /dashboard guard,
  // and it also makes post-login push("/dashboard") land customers on /me.
  if (session.user.role === "user") redirect("/me");

  // One read covers PIN state + the header avatar (name/image). A session can
  // outlive its user row (e.g. dev DB reseeded) — treat that as expired.
  let user;
  try {
    user = await timed("user", usersService.read(session.user.id));
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

  const role = session.user.role;
  const email = user.email ?? session.user.email ?? "";

  // Staff with a rep allowance get today's daily-coupon card in the sidebar and the
  // floating Create coupon button. publicId is the session id; the service resolves it
  // to the internal owner id server-side.
  const hasRepAllowance = repAllowanceFor(await getDiscountPolicy(), session.user.id) != null;
  const loadRepCoupon = async (): Promise<RepCouponToday | null> => {
    if (!hasRepAllowance) return null;
    // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
    const istDate = zonedDateIso(Date.now(), "Asia/Kolkata");
    return couponsService.getTodayRepCoupon(session.user.id, istDate);
  };

  // Independent reads; this layout blocks first byte of every /dashboard page.
  const [{ timezone, cutoffHour }, memberOrganizations, activity, repCoupon, notificationFeed] = await Promise.all([
    timed("settings", getAppSettings()),
    timed("orgs", getMemberOrganizations(session)),
    timed("activity", newActivity()),
    timed("repCoupon", loadRepCoupon()),
    // Server-rendered so the bell paints with its badge instead of fetching after hydration.
    timed("feed", getFeed(user.id)),
  ]);
  log();

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
          <AppClock cutoffHour={cutoffHour} />
          {/* Streams in after the shell: two small reads that must not hold up every page. */}
          <Suspense fallback={null}>
            <RoutePushBadge />
          </Suspense>
          <OrgSwitcher organizations={memberOrganizations} activeOrganizationId={session.session.activeOrganizationId} />
          <NotificationBellMount userPublicId={session.user.id} initial={notificationFeed} />
          <LockButton hasPin={hasPin} />
          <ModeToggle />
        </>
      }
      footer={hasPin ? <IdleLock /> : null}
      bottomNav={<AppBottomNav role={role} />}
    >
      <InboxRealtime tickets payments={role === "admin"} />
      {hasRepAllowance && <RepCodeFab />}
      {children}
      {/* Room to scroll the last row out from under the floating button. */}
      {hasRepAllowance && <div aria-hidden className="h-20" />}
    </CrmShell>
    </QuickAddProvider>
    </TimezoneProvider>
    </div>
  );
}
