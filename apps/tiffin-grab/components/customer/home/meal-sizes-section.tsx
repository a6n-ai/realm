"use client";

import { useState } from "react";
import { Skeleton } from "@realm/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@realm/ui/collapsible";
import { cn } from "@realm/ui/cn";
import { ChevronDownIcon } from "lucide-react";
import { Card, SectionCard } from "@/components/ds";
import { Reveal } from "@/components/motion";
import type { CustomerDish } from "@/lib/services/dishes.service";
import type { ClientMealSizeView } from "@/lib/catalog/types";
import { DishSlideshow } from "./dish-slideshow";

const TIER_LABEL: Record<ClientMealSizeView["tier"], string> = {
  budget: "Budget",
  medium: "Medium",
  premium: "Premium",
};

function MealSizeCard({ mealSize, dishPool }: { mealSize: ClientMealSizeView; dishPool: CustomerDish[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Card variant="flat" className="overflow-hidden p-0">
      <div className="relative aspect-video w-full overflow-hidden">
        <DishSlideshow dishes={dishPool.slice(0, 5)} className="h-full w-full" />
      </div>
      <div className="space-y-1.5 p-4">
        <p className="text-muted-foreground text-xs font-medium">{TIER_LABEL[mealSize.tier]} · {mealSize.planKey}</p>
        <p className="text-base font-semibold">{mealSize.name}</p>
        {mealSize.components.length > 0 && (
          <p className="text-muted-foreground text-sm">{mealSize.components.join(" · ")}</p>
        )}
        <p className="text-sm">
          ~{mealSize.kcalMin}–{mealSize.kcalMax} kcal
          {mealSize.proteinG !== null && <> · {mealSize.proteinG}g protein</>}
        </p>
        <p className="text-sm font-semibold">${mealSize.basePrice.toFixed(2)} / meal</p>

        {mealSize.items.length > 0 && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="text-primary flex items-center gap-1 pt-1 text-xs font-medium">
              {open ? "Hide details" : "See what's included"}
              <ChevronDownIcon className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <ul className="space-y-1 text-sm">
                {mealSize.items.map((item) => (
                  <li key={item.name} className="flex items-center justify-between gap-2">
                    <span>{item.name}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {item.qty}
                      {item.weightValue !== null ? ` · ${item.weightValue}${item.weightUnit ?? ""}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </Card>
  );
}

function groupByPlanKey(mealSizes: ClientMealSizeView[]): Map<string, ClientMealSizeView[]> {
  const groups = new Map<string, ClientMealSizeView[]>();
  for (const mealSize of mealSizes) {
    const group = groups.get(mealSize.planKey) ?? [];
    group.push(mealSize);
    groups.set(mealSize.planKey, group);
  }
  return groups;
}

export function MealSizesSection({ mealSizes, dishPool }: { mealSizes: ClientMealSizeView[]; dishPool: CustomerDish[] }) {
  const groups = groupByPlanKey(mealSizes);

  return (
    <SectionCard title="Meal sizes">
      <div className="space-y-6">
        {Array.from(groups.entries()).map(([planKey, sizes]) => (
          <div key={planKey}>
            <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{planKey}</p>
            <Reveal.Group className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sizes.map((mealSize) => (
                <Reveal key={mealSize.publicId}>
                  <MealSizeCard mealSize={mealSize} dishPool={dishPool} />
                </Reveal>
              ))}
            </Reveal.Group>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// Named skeleton twin — a Server Component cannot dot into this "use client"
// module's export (the /dashboard/orders bug).
export function MealSizesSectionSkeleton() {
  return (
    <SectionCard title="Meal sizes">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
