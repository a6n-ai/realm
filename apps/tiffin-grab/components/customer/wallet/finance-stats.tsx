import { Skeleton } from "@/components/customer/kit";
import type { UsageSummary } from "@/lib/services/customer-usage.service";

function money(amount: string, currency: string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(Number(amount));
}

export function FinanceStats({ usage, currency }: { usage: UsageSummary; currency: string }) {
  return (
    <p aria-label="Your totals" className="c-caption nums -mt-2">
      Spent {money(usage.totalSpent, currency)} · Saved {money(usage.totalSaved, currency)}
    </p>
  );
}

export function FinanceStatsSkeleton() {
  return <Skeleton className="-mt-2 h-4 w-52 rounded-full" />;
}
