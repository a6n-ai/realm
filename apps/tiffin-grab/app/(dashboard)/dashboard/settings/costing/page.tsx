import Link from "next/link";
import { Suspense } from "react";
import { CalculatorIcon } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ds";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@foundry/ui/card";
import { Skeleton } from "@foundry/ui/skeleton";
import { getProfitabilityAssumptions } from "@/lib/analytics/profitability-settings";
import { AssumptionsForm } from "../../analytics/profitability/assumptions-form";

export default async function CostingSettingsPage() {
  await requirePagePermission({ settings: ["read"] });
  return (
    <div className="grid gap-6">
      <PageHeader icon={CalculatorIcon} title="Costing" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Costs and margins</CardTitle>
            <CardDescription>Used by Analytics → Profitability and by staff pricing in Estimate and New order.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <CostingForm />
            </Suspense>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>How cost is worked out</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
            <p>
              Food per tiffin comes from each meal size&apos;s items at the{" "}
              <Link href="/dashboard/catalog/cost-rates" className="text-primary underline-offset-4 hover:underline">
                category cost rates
              </Link>
              . A meal size with a Cost price uses that instead.
            </p>
            <p>Plan cost = (food + driver + other per tiffin) × tiffins. Marketing and salaries stay in Profitability only.</p>
            <p>Staff see the cost and margin on every quote. Discounts past the target margin get a warning; past the minimum margin they are refused.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function CostingForm() {
  return <AssumptionsForm current={await getProfitabilityAssumptions()} />;
}
