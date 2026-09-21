import { Skeleton, StatTile } from "@/components/customer/kit";
import type { UsageSummary } from "@/lib/services/customer-usage.service";

function money(amount: string, currency: string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(Number(amount));
}

export function FinanceStats({ usage, currency }: { usage: UsageSummary; currency: string }) {
  return (
    <section aria-label="Your totals" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile label="Tiffins delivered" value={usage.tiffinsDelivered} />
      <StatTile label="Subscriptions" value={usage.subscriptionCount} />
      <StatTile label="Spent" value={money(usage.totalSpent, currency)} />
      <StatTile label="Saved" value={money(usage.totalSaved, currency)} />
    </section>
  );
}

export function FinanceStatsSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[92px] rounded-[20px]" />
      ))}
    </div>
  );
}
