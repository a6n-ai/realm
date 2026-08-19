"use client";

import { Skeleton } from "@realm/ui/skeleton";
import { OrderStatusBadge, SectionCard } from "@/components/ds";
import { formatDateOnly } from "@/lib/format/datetime";
import type { SubSummary } from "@/lib/services/customer-deliveries.service";
import { CURRENT } from "@/components/customer/subscribe/existing-subscriptions";

const TITLE = "Earlier plans";
const SUBTITLE = "Plans that have already ended.";

export function OrdersSection({ subs }: { subs: SubSummary[] }) {
  const past = subs.filter((s) => !CURRENT.has(s.status));
  if (past.length === 0) return null;

  return (
    <SectionCard title={TITLE} subtitle={SUBTITLE}>
      <ul>
        {past.map((s) => (
          <li
            key={s.publicId}
            className="flex items-center justify-between gap-3 border-t py-2.5 first:border-t-0 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{s.mealSizeName}</p>
              <p className="text-muted-foreground text-xs">
                {s.planName}
                {s.startDate ? ` · ${formatDateOnly(s.startDate, { mode: "short" })}` : ""}
              </p>
            </div>
            <OrderStatusBadge status={s.status} />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function OrdersSectionSkeleton() {
  return (
    <SectionCard title={TITLE} subtitle={SUBTITLE}>
      <Skeleton className="h-16 w-full rounded-lg" />
    </SectionCard>
  );
}
