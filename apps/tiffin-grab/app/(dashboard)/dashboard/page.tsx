import { Suspense } from "react";
import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ChevronRightIcon,
  ClockIcon,
  DollarSignIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  PackageIcon,
  ReceiptIcon,
  SparklesIcon,
  UserIcon,
  UsersIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { Role, formatMoney as fmt } from "@realm/commons";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { getCustomerDashboard } from "@/lib/services/customers.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { formatEpoch } from "@/lib/format/datetime";
import { Badge } from "@realm/ui/badge";
import { Skeleton } from "@realm/ui/skeleton";
import { cn } from "@realm/ui/cn";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@realm/ui/table";
import {
  PageShell,
  PageHeader,
  StatCard,
  SectionCard,
  Card,
  ListRow,
  EmptyState,
  OrderStatusBadge,
  ORDER_STATUS_LABEL,
  PageSkeleton,
  SkeletonStatCards,
} from "@/components/ds";


async function loadStats() {
  const [userCount, subsTotal, subsActive, subsWaitlisted, revenue] = await Promise.all([
    db.$count(users),
    db.$count(orders),
    db.$count(orders, eq(orders.status, "active")),
    db.$count(orders, eq(orders.status, "waitlisted")),
    db
      .select({ total: sql<string>`coalesce(sum(${orders.total}), 0)` })
      .from(orders)
      .where(eq(orders.status, "active"))
      .then((r) => Number(r[0]?.total ?? 0)),
  ]);
  return { userCount, subsTotal, subsActive, subsWaitlisted, revenue };
}

// The page shell returns synchronously (no top-level await), so `loading.tsx`
// never fires — instead the role gate and each data region stream into their own
// <Suspense> with a skeleton that mirrors the resolved component.
export default function DashboardOverviewPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" stats={4} columns={5} action={false} />}>
      <DashboardData />
    </Suspense>
  );
}

async function DashboardData() {
  // Staff-only: the overview exposes business-wide stats and customer PII.
  // Customers landing here are sent to their account page.
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== Role.ADMIN && session.user.role !== Role.MEMBER) {
    return <CustomerDashboard userId={session.user.id} />;
  }
  return <StaffOverview />;
}

function StaffOverview() {
  return (
    <PageShell>
      <PageHeader
        icon={LayoutDashboardIcon}
        title="Overview"
        subtitle="Operational snapshot across orders and members."
      />

      <Suspense fallback={<SkeletonStatCards count={4} />}>
        <OverviewStats />
      </Suspense>

      <SectionCard title="Recent orders" subtitle="The latest plans deployed through checkout.">
        <Suspense fallback={<RecentOrders.Skeleton />}>
          <RecentOrders />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function OverviewStats() {
  await requireStaff();
  const stats = await loadStats();

  const cards = [
    { label: "Members", value: String(stats.userCount), hint: "registered accounts", icon: UsersIcon },
    { label: "Active orders", value: String(stats.subsActive), hint: `${stats.subsTotal} total`, icon: PackageIcon },
    { label: "Waitlisted", value: String(stats.subsWaitlisted), hint: "pending delivery zones", icon: ClockIcon },
    { label: "Revenue", value: fmt(stats.revenue), hint: "active plans", icon: DollarSignIcon },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} hint={c.hint} />
      ))}
    </div>
  );
}

// Single source of truth for the recent-orders table columns. The real header and
// the .Skeleton twin both render from this, so the loading state can't drift.
const RECENT_ORDER_COLUMNS = [
  { key: "deployment", label: "Deployment" },
  { key: "customer", label: "Customer" },
  { key: "city", label: "City" },
  { key: "status", label: "Status" },
  { key: "total", label: "Total", align: "right" },
] as const;

async function RecentOrders() {
  await requireStaff();
  const recent = await db
    .select({
      deploymentId: orders.deploymentId,
      status: orders.status,
      fullName: orders.fullName,
      city: orders.city,
      total: orders.total,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .orderBy(desc(orders.createdAt))
    .limit(5);

  if (recent.length === 0) {
    return <p className="text-muted-foreground text-sm">No orders yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {RECENT_ORDER_COLUMNS.map((c) => (
            <TableHead key={c.key} className={"align" in c ? "text-right" : undefined}>
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {recent.map((r) => (
          <TableRow key={r.deploymentId}>
            <TableCell className="font-mono text-xs">{r.deploymentId}</TableCell>
            <TableCell>{r.fullName}</TableCell>
            <TableCell>{r.city}</TableCell>
            <TableCell>
              <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
            </TableCell>
            <TableCell className="text-right">{fmt(Number(r.total))}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Exact loading twin: same RECENT_ORDER_COLUMNS + Table markup, grey cells instead
// of data. Used as the page's <Suspense fallback> so it can't drift from the table.
RecentOrders.Skeleton = function RecentOrdersSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {RECENT_ORDER_COLUMNS.map((c) => (
            <TableHead key={c.key} className={"align" in c ? "text-right" : undefined}>
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 8 }).map((_, r) => (
          <TableRow key={r}>
            {RECENT_ORDER_COLUMNS.map((c) => (
              <TableCell key={c.key} className={"align" in c ? "text-right" : undefined}>
                <Skeleton className={cn("h-4 w-full max-w-32", "align" in c && "ml-auto")} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

const CUSTOMER_LINKS = [
  {
    href: "/dashboard/meals",
    title: "My meals",
    description: "See this week's menu and what's arriving at your door.",
    icon: UtensilsCrossedIcon,
  },
  {
    href: "/dashboard/account",
    title: "Account",
    description: "Delivery address, dietary preferences, and notifications.",
    icon: UserIcon,
  },
] as const;

// startDate is a calendar date (YYYY-MM-DD) with no time-of-day, so it carries no
// TZ offset of its own. Render it at noon UTC formatted in the delivery (Canada)
// timezone so it never slips to the previous/next day across a DST boundary.
function formatDeliveryDate(iso: string, timeZone: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "short", day: "numeric", timeZone,
  }).format(Date.UTC(y, m - 1, d, 12));
}

// Short label for the delivery timezone (e.g. "EDT") so customer-facing dates are
// unambiguously stamped in Canada local time, not the viewer's locale.
function zoneAbbrev(timeZone: string): string {
  const part = new Intl.DateTimeFormat("en-CA", { timeZone, timeZoneName: "short" })
    .formatToParts(Date.now())
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

function QuickLinks() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {CUSTOMER_LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="group rounded-xl">
          <Card className="flex h-full items-start justify-between gap-4 p-5 transition-colors group-hover:border-foreground/20">
            <div className="flex items-start gap-3">
              <link.icon className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <h2 className="text-base font-semibold">{link.title}</h2>
                <p className="text-muted-foreground mt-1 text-sm text-pretty">{link.description}</p>
              </div>
            </div>
            <ChevronRightIcon
              className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Card>
        </Link>
      ))}
    </div>
  );
}

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={`mt-0.5 text-sm font-medium${mono ? " font-mono" : " nums"}`}>{value}</dd>
    </div>
  );
}

async function CustomerDashboard({ userId }: { userId: string }) {
  const [data, settings] = await Promise.all([getCustomerDashboard(userId), getAppSettings()]);
  const tz = settings.timezone;
  const firstName = data.profile.name?.trim().split(/\s+/)[0];
  const { current } = data;
  // A cancelled order is terminal, not a live subscription: don't advertise it on the
  // lifetime card or render it as the current plan. active/paused/waitlisted/pending
  // remain real (live or upcoming) subscriptions.
  const subscription = current && current.status !== "cancelled" ? current : null;

  const cards = [
    {
      label: "Total spent",
      value: fmt(Number(data.totalSpent)),
      hint: "lifetime, net of refunds",
      icon: DollarSignIcon,
    },
    {
      label: "Subscription",
      value: subscription ? ORDER_STATUS_LABEL[subscription.status] ?? subscription.status : "None",
      hint: subscription ? subscription.planName : "no active plan",
      icon: SparklesIcon,
    },
    {
      label: "Orders",
      value: String(data.ordersCount),
      hint: data.activeCount > 0 ? `${data.activeCount} active` : "all time",
      icon: PackageIcon,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        icon={LayoutDashboardIcon}
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        subtitle="Your subscription, spend, and order history at a glance."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} hint={c.hint} />
        ))}
      </div>

      <SectionCard
        title="Current subscription"
        subtitle={subscription ? `Dates shown in delivery time (${zoneAbbrev(tz)}).` : undefined}
        action={subscription ? <OrderStatusBadge status={subscription.status} /> : undefined}
      >
        {subscription ? (
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-base font-semibold">{subscription.planName}</div>
              <div className="text-muted-foreground text-sm">
                {subscription.mealSizeName} · {subscription.durationWeeks} week{subscription.durationWeeks === 1 ? "" : "s"}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <DetailField label="Per tiffin" value={fmt(Number(subscription.perTiffinPrice))} />
              <DetailField label="Plan total" value={fmt(Number(subscription.total))} />
              <DetailField label="Starts" value={formatDeliveryDate(subscription.startDate, tz)} />
              <DetailField label="Reference" value={subscription.deploymentId} mono />
            </dl>
            <Link
              href="/dashboard/meals"
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              View this week's meals
            </Link>
          </div>
        ) : (
          <EmptyState
            icon={UtensilsCrossedIcon}
            message="You don't have a subscription yet. Build a plan to start getting fresh tiffins delivered."
            action={
              <Link
                href="/subscribe"
                className="bg-primary text-primary-foreground inline-block rounded-md px-4 py-2 text-sm font-medium"
              >
                Subscribe now
              </Link>
            }
          />
        )}
      </SectionCard>

      <SectionCard
        title="Past orders"
        subtitle={`Every plan you've ordered, newest first. Dates in delivery time (${zoneAbbrev(tz)}).`}
      >
        {data.orders.length === 0 ? (
          <EmptyState icon={ReceiptIcon} message="No orders yet." />
        ) : (
          <div className="space-y-2">
            {data.orders.map((o) => (
              <ListRow
                key={o.publicId}
                title={`${o.planName} · ${o.mealSizeName}`}
                meta={`${o.durationWeeks} week${o.durationWeeks === 1 ? "" : "s"} · ${formatEpoch(o.createdAt, { timeZone: tz, mode: "date", locale: "en-CA" })} · ${o.deploymentId}`}
                trailing={
                  <>
                    <span className="nums text-sm font-medium">{fmt(Number(o.total))}</span>
                    <OrderStatusBadge status={o.status} />
                    <Link
                      href={`/dashboard/support/new?orderId=${o.publicId}`}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
                    >
                      <LifeBuoyIcon className="size-3.5" aria-hidden />
                      Report an issue
                    </Link>
                  </>
                }
              />
            ))}
          </div>
        )}
      </SectionCard>

      <QuickLinks />
    </PageShell>
  );
}
