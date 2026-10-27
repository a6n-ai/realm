import { PiggyBank, Wallet } from "lucide-react";
import { IconTile, Skeleton, StatGroup, StatTile } from "@/components/customer/kit";
import type { UsageSummary } from "@/lib/services/customer-usage.service";

function money(amount: string, currency: string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(Number(amount));
}

export function FinanceStats({ usage, currency }: { usage: UsageSummary; currency: string }) {
  return (
    <StatGroup>
      <StatTile bare icon={<IconTile tint="purple"><Wallet /></IconTile>} label="Spent" value={money(usage.totalSpent, currency)} />
      <StatTile bare icon={<IconTile tint="pink"><PiggyBank /></IconTile>} label="Saved" value={money(usage.totalSaved, currency)} />
    </StatGroup>
  );
}

export function FinanceStatsSkeleton() {
  return <Skeleton className="h-[104px] rounded-[20px]" />;
}
