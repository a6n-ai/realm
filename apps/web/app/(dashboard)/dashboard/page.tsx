import { desc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ClockIcon, DollarSignIcon, PackageIcon, UsersIcon } from "lucide-react";
import { Role } from "@tiffin/commons";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TypographyH2, TypographyMuted } from "@/components/ui/typography";

const fmt = (n: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);

async function loadStats() {
  const [userCount, subsTotal, subsActive, subsWaitlisted, revenue] = await Promise.all([
    db.$count(users),
    db.$count(orders),
    db.$count(orders, eq(orders.status, "active")),
    db.$count(orders, eq(orders.status, "waitlisted")),
    db
      .select({ total: sql<string>`coalesce(sum(${orders.weeklyFee}), 0)` })
      .from(orders)
      .where(eq(orders.status, "active"))
      .then((r) => Number(r[0]?.total ?? 0)),
  ]);
  return { userCount, subsTotal, subsActive, subsWaitlisted, revenue };
}

export default async function DashboardOverviewPage() {
  // Staff-only: the overview exposes business-wide stats and customer PII.
  // Customers landing here are sent to their account page.
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== Role.ADMIN && session.user.role !== Role.MEMBER) {
    redirect("/dashboard/account");
  }

  const stats = await loadStats();
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

  const cards = [
    { label: "Members", value: String(stats.userCount), hint: "registered accounts", icon: UsersIcon },
    { label: "Active orders", value: String(stats.subsActive), hint: `${stats.subsTotal} total`, icon: PackageIcon },
    { label: "Waitlisted", value: String(stats.subsWaitlisted), hint: "pending delivery zones", icon: ClockIcon },
    { label: "Weekly revenue", value: fmt(stats.revenue), hint: "from active plans", icon: DollarSignIcon },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <TypographyH2 className="border-0 pb-0">Overview</TypographyH2>
        <TypographyMuted>Operational snapshot across orders and members.</TypographyMuted>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardDescription>{c.label}</CardDescription>
              <c.icon className="text-muted-foreground size-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tracking-tight">{c.value}</div>
              <p className="text-muted-foreground mt-1 text-xs">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent orders</CardTitle>
          <CardDescription>The latest plans deployed through checkout.</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <TypographyMuted>No orders yet.</TypographyMuted>
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
        </CardContent>
      </Card>
    </div>
  );
}
