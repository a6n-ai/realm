import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ChevronRightIcon,
  ClockIcon,
  DollarSignIcon,
  LayoutDashboardIcon,
  PackageIcon,
  ReceiptIcon,
  SparklesIcon,
  UserIcon,
  UsersIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { Role } from "@tiffin/commons";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { getCustomerDashboard } from "@/lib/services/customers.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { formatEpoch } from "@/lib/format/datetime";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PageShell,
  PageHeader,
  StatCard,
  SectionCard,
  Card,
  ListRow,
  EmptyState,
  OrderStatusBadge,
} from "@/components/ds";

const fmt = (n: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);

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

export default async function DashboardOverviewPage() {
  // Staff-only: the overview exposes business-wide stats and customer PII.
  // Customers landing here are sent to their account page.
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== Role.ADMIN && session.user.role !== Role.MEMBER) {
    return <CustomerDashboard userId={session.user.id} />;
  }

  const [stats, recent] = await Promise.all([
    loadStats(),
    db
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
      .limit(5),
  ]);

  const cards = [
    { label: "Members", value: String(stats.userCount), hint: "registered accounts", icon: UsersIcon },
    { label: "Active orders", value: String(stats.subsActive), hint: `${stats.subsTotal} total`, icon: PackageIcon },
    { label: "Waitlisted", value: String(stats.subsWaitlisted), hint: "pending delivery zones", icon: ClockIcon },
    { label: "Revenue", value: fmt(stats.revenue), hint: "active plans", icon: DollarSignIcon },
  ];

  return (
    <PageShell>
      <PageHeader
        icon={LayoutDashboardIcon}
        title="Overview"
        subtitle="Operational snapshot across orders and members."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} hint={c.hint} />
        ))}
      </div>

      <SectionCard title="Recent orders" subtitle="The latest plans deployed through checkout.">
        {recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">No orders yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deployment</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
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
        )}
      </SectionCard>
    </PageShell>
  );
}

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

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", active: "Active", waitlisted: "Waitlisted", paused: "Paused", cancelled: "Cancelled",
};

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

  const cards = [
    {
      label: "Total spent",
      value: fmt(Number(data.totalSpent)),
      hint: "lifetime, net of refunds",
      icon: DollarSignIcon,
    },
    {
      label: "Active subscription",
      value: current ? STATUS_LABEL[current.status] ?? current.status : "None",
      hint: current ? current.planName : "no plan yet",
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
        subtitle={current ? `Dates shown in delivery time (${zoneAbbrev(tz)}).` : undefined}
        action={current ? <OrderStatusBadge status={current.status} /> : undefined}
      >
        {current ? (
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-base font-semibold">{current.planName}</div>
              <div className="text-muted-foreground text-sm">
                {current.mealSizeName} · {current.durationWeeks} week{current.durationWeeks === 1 ? "" : "s"}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <DetailField label="Per tiffin" value={fmt(Number(current.perTiffinPrice))} />
              <DetailField label="Plan total" value={fmt(Number(current.total))} />
              <DetailField label="Starts" value={formatDeliveryDate(current.startDate, tz)} />
              <DetailField label="Reference" value={current.deploymentId} mono />
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
              <a
                href="/subscribe"
                className="bg-primary text-primary-foreground inline-block rounded-md px-4 py-2 text-sm font-medium"
              >
                Subscribe now
              </a>
            }
          />
        )}
      </SectionCard>

      <SectionCard title="Past orders" subtitle="Every plan you've ordered, newest first.">
        {data.orders.length === 0 ? (
          <EmptyState icon={ReceiptIcon} message="No orders yet." />
        ) : (
          <div className="space-y-2">
            {data.orders.map((o) => (
              <ListRow
                key={o.publicId}
                title={`${o.planName} · ${o.mealSizeName}`}
                meta={`${o.durationWeeks} week${o.durationWeeks === 1 ? "" : "s"} · ${formatEpoch(o.createdAt, { timeZone: tz, mode: "date" })} · ${o.deploymentId}`}
                trailing={
                  <>
                    <span className="nums text-sm font-medium">{fmt(Number(o.total))}</span>
                    <OrderStatusBadge status={o.status} />
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
