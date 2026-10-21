import { SkeletonStatCards, StatGrid, type StatItem } from "@/components/ds";

// Every Discounts tab opens on the same five-card row; the skeleton twin keeps the same grid.
export function DiscountStats({ items }: { items: StatItem[] }) {
  return <StatGrid cols={5} items={items} />;
}

export function DiscountStatsSkeleton() {
  return <SkeletonStatCards count={5} className="md:grid-cols-2 lg:grid-cols-5" />;
}

export const usd = (n: number) => `$${n.toFixed(2)}`;
