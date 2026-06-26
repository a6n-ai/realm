import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ChevronRightIcon,
  ClockIcon,
  DollarSignIcon,
  LayoutDashboardIcon,
  PackageIcon,
  UserIcon,
  UsersIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { Role } from "@tiffin/commons";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageShell, PageHeader, StatCard, SectionCard, Card } from "@/components/ds";

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
    return <CustomerWelcome />;
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

function CustomerWelcome() {
  return (
    <PageShell>
      <PageHeader
        icon={LayoutDashboardIcon}
        title="Welcome back"
        subtitle="Pick up where you left off — your meals and account are a tap away."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {CUSTOMER_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="group rounded-xl">
            <Card className="flex h-full items-start justify-between gap-4 p-5 transition-colors group-hover:border-foreground/20">
              <div className="flex items-start gap-3">
                <link.icon className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
                <div>
                  <h2 className="text-base font-semibold">{link.title}</h2>
                  <p className="text-muted-foreground mt-1 text-sm text-pretty">
                    {link.description}
                  </p>
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
    </PageShell>
  );
}
