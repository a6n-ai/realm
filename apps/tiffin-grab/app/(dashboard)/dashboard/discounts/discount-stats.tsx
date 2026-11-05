import { SkeletonStatCards, type StatItem } from "@/components/ds";
import { StatCards, type StatCardItem } from "@/components/dashboard/stat-cards";

export type DiscountStat = StatItem & { href?: string };

// Every Discounts tab opens on the same five-card row; the skeleton twin keeps the same grid.
// Local StatCards so a count can drill into the filtered list. Sums and rates stay plain.
export function DiscountStats({ items }: { items: DiscountStat[] }) {
  const cards: StatCardItem[] = items.map(({ label, value, hint, icon, href, tone }) => ({
    label,
    value,
    hint,
    icon,
    href,
    tone: tone === "ok" || tone === "bad" ? tone : undefined,
  }));
  return <StatCards cols={5} items={cards} />;
}

export function DiscountStatsSkeleton() {
  return <SkeletonStatCards count={5} className="md:grid-cols-2 lg:grid-cols-5" />;
}

export const usd = (n: number) => `$${n.toFixed(2)}`;
