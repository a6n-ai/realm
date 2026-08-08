import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BarChart3Icon } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@realm/ui/table";
import { currentUserId } from "@/lib/services/session-service";
import { getCustomerUsage } from "@/lib/services/customer-usage.service";
import { PageShell, PageHeader, SectionCard, StatGrid, SkeletonStatCards } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { USAGE_FACETS } from "@/components/customer/usage/usage-facets";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function MyUsagePage({ searchParams }: { searchParams: SearchParams }) {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  return (
    <PageShell>
      <PageHeader
        icon={BarChart3Icon}
        title="Usage"
        subtitle="Your tiffins, subscriptions, spend, and savings."
      />
      <ReuiFacetFilters spec={USAGE_FACETS} />
      <Suspense fallback={<UsageSkeleton />}>
        <UsageData userId={userId} searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function UsageData({ userId, searchParams }: { userId: bigint; searchParams: SearchParams }) {
  const sp = await searchParams;
  const from = sp.from ? Number(sp.from) : 0;
  const to = sp.to ? Number(sp.to) : Date.now();
  const usage = await getCustomerUsage(userId, from, to);

  return (
    <div className="space-y-6">
      <StatGrid
        cols={4}
        items={[
          { label: "Tiffins delivered", value: usage.tiffinsDelivered },
          { label: "Subscriptions", value: usage.subscriptionCount },
          { label: "Total spent", value: `$${usage.totalSpent}` },
          { label: "Total saved (discounts)", value: `$${usage.totalSaved}` },
        ]}
      />

      <SectionCard title="Plans taken" subtitle="Subscriptions started in this window, by plan.">
        {usage.plans.length === 0 ? (
          <p className="text-muted-foreground text-sm">No subscriptions in this window.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Subscriptions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.plans.map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.orders}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}

function UsageSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonStatCards count={4} />
      <SectionCard title="Plans taken">
        <div className="h-24" />
      </SectionCard>
    </div>
  );
}
