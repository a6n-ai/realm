"use client";

import { ArrowRightIcon, UtensilsIcon } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@realm/ui/skeleton";
import { Card, EmptyState, SectionCard } from "@/components/ds";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";

const PLAN_TYPE_LABEL: Record<ClientCatalogSnapshot["plans"][number]["planType"], string> = {
  tiffin: "Tiffin",
  healthy: "Healthy",
};

function PlanCard({ plan }: { plan: ClientCatalogSnapshot["plans"][number] }) {
  return (
    <Link href="/subscribe" className="block min-w-[240px] shrink-0 sm:min-w-0 sm:shrink">
      <Card variant="lift" className="flex h-full flex-col justify-between gap-3 p-4">
        <div className="space-y-1">
          <span className="text-muted-foreground text-xs font-medium">{PLAN_TYPE_LABEL[plan.planType]}</span>
          <p className="text-sm font-semibold">{plan.name}</p>
          {plan.description && <p className="text-muted-foreground text-xs text-pretty">{plan.description}</p>}
        </div>
        <span className="text-primary inline-flex items-center gap-1 text-sm font-medium">
          Subscribe <ArrowRightIcon className="size-3.5" />
        </span>
      </Card>
    </Link>
  );
}

export function BrowsePlansSection({ plans }: { plans: ClientCatalogSnapshot["plans"] }) {
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
        <Skeleton className="h-28 min-w-[240px] rounded-lg sm:min-w-0" />
        <Skeleton className="h-28 min-w-[240px] rounded-lg sm:min-w-0" />
      </div>
    </SectionCard>
  );
}
