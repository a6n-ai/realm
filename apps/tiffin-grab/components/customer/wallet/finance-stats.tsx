import { PiggyBank, Wallet } from "lucide-react";
import { IconTile, StatGroup, StatTile } from "@/components/kit";
import type { UsageSummary } from "@/lib/services/customer-usage.service";
import { StatGroupSkeleton } from "@/components/kit/skeleton-parts";
import { formatMoney } from "@foundry/commons";

const money = (amount: string, currency: string) => formatMoney(Number(amount), currency, { narrow: true });

export function FinanceStats({ usage, currency }: { usage: UsageSummary; currency: string }) {
  return (
    <StatGroup>
      <StatTile bare icon={<IconTile tint="purple"><Wallet /></IconTile>} label="Spent" value={money(usage.totalSpent, currency)} />
      <StatTile bare icon={<IconTile tint="pink"><PiggyBank /></IconTile>} label="Saved" value={money(usage.totalSaved, currency)} />
    </StatGroup>
  );
}

export function FinanceStatsSkeleton() {
  return <StatGroupSkeleton hint={false} />;
}
