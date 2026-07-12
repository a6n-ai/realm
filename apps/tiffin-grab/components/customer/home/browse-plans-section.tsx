"use client";

import { ArrowRightIcon, UtensilsIcon } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@realm/ui/skeleton";
import { Card, EmptyState, SectionCard } from "@/components/ds";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { PlanHero } from "./plan-hero";

export type PlanWithPrice = ClientCatalogSnapshot["plans"][number] & { priceFrom: number | null };

const PLAN_TYPE_LABEL: Record<ClientCatalogSnapshot["plans"][number]["planType"], string> = {
  tiffin: "Tiffin",
  healthy: "Healthy",
};

function PlanCard({ plan }: { plan: PlanWithPrice }) {
  return (
    <Link href="/subscribe" className="block min-w-[240px] shrink-0 sm:min-w-0 sm:shrink">
      <Card variant="lift" className="flex h-full flex-col gap-0 overflow-hidden p-0">
        <PlanHero planKey={plan.key} planType={plan.planType} />
        <div className="flex flex-1 flex-col justify-between gap-3 p-4">
          <div className="space-y-1">
            <span className="text-muted-foreground text-xs font-medium">{PLAN_TYPE_LABEL[plan.planType]}</span>
            <p className="text-sm font-semibold">{plan.name}</p>
            {plan.description && <p className="text-muted-foreground text-xs text-pretty">{plan.description}</p>}
          </div>
          <div className="flex items-center justify-between gap-2">
            {plan.priceFrom != null && (
              <span className="nums text-sm font-semibold">from ${plan.priceFrom.toFixed(2)}</span>
            )}
            <span className="text-primary inline-flex items-center gap-1 text-sm font-medium">
              Subscribe <ArrowRightIcon className="size-3.5" />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function BrowsePlansSection({ plans }: { plans: PlanWithPrice[] }) {
  return (
    <SectionCard title="Browse plans">
      {plans.length === 0 ? (
        <EmptyState icon={UtensilsIcon} message="No plans available right now." />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard key={plan.key} plan={plan} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// Named skeleton twin — a Server Component cannot dot into this "use client"
// module's export (the /dashboard/orders bug).
export function BrowsePlansSectionSkeleton() {
  return (
    <SectionCard title="Browse plans">
      <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
        <Skeleton className="h-52 min-w-[240px] rounded-lg sm:min-w-0" />
        <Skeleton className="h-52 min-w-[240px] rounded-lg sm:min-w-0" />
      </div>
    </SectionCard>
  );
}
