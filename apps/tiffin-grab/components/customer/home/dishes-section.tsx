"use client";

import { useState } from "react";
import { Skeleton } from "@foundry/ui/skeleton";
import { cn } from "@foundry/ui/cn";
import { SectionCard } from "@/components/ds";
import { Reveal, Pressable, LottieEmptyState } from "@/components/motion";
import type { CustomerDish } from "@/lib/services/dishes.service";
import { PlanTags } from "./plan-tags";
import { DishImage } from "./dish-image";
import { DishModal } from "./dish-modal";

export function DishesSection({
  dishes,
  daysByDish,
  dense = false,
}: {
  dishes: CustomerDish[];
  daysByDish?: Record<string, string[]>;
  /** Food-app density: more columns, shorter cards (Menu page). */
  dense?: boolean;
}) {
  const [selected, setSelected] = useState<CustomerDish | null>(null);

  if (dishes.length === 0) {
    return (
      <SectionCard title="Dishes" subtitle="Browse the catalog — tap a photo for details.">
        <LottieEmptyState animation="empty-box" title="No dishes to show yet" />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={dense ? "All dishes" : "Dishes"}
      subtitle="Browse the catalog — tap a photo for details."
    >
      <Reveal.Group
        className={cn(
          "grid gap-2.5",
          dense
            ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7"
            : "grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4",
        )}
      >
        {dishes.map((dish) => {
          const onMenu = daysByDish?.[dish.publicId];
          return (
            <Reveal key={dish.publicId}>
              <Pressable
                type="button"
                aria-label={dish.name}
                title={dish.name}
                onClick={() => setSelected(dish)}
                className="flex w-full flex-col gap-1 rounded-lg text-left transition-transform active:scale-[0.96]"
              >
                <div
                  className={cn(
                    "border-border relative w-full overflow-hidden border",
                    dense ? "aspect-[4/3] rounded-md" : "aspect-square rounded-lg",
                  )}
                >
                  <DishImage image={dish.image} name={dish.name} category={dish.category} sizes={dense ? "120px" : "200px"} />
                  <PlanTags
                    tags={dish.planTags}
                    dots
                    className={cn("absolute", dense ? "right-1 top-1" : "right-1.5 top-1.5")}
                  />
                  {onMenu && onMenu.length > 0 ? (
                    // Green accent badge — orange is now the page's primary/brand
                    // color (nav, headers), so this uses the secondary accent
                    // instead to stay visually distinct from that, not --warn.
                    <span className="bg-accent-badge text-accent-badge-foreground absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
                      This week
                    </span>
                  ) : null}
                </div>
                <span className={cn("block truncate font-medium", dense ? "text-[11px] leading-tight" : "mt-1 text-xs")}>
                  {dish.name}
                </span>
              </Pressable>
            </Reveal>
          );
        })}
      </Reveal.Group>

      <DishModal
        dish={{
          name: selected?.name ?? "",
          description: selected?.description ?? null,
          image: selected?.image ?? null,
          planTags: selected?.planTags ?? [],
        }}
        daysOnMenu={selected?.publicId ? daysByDish?.[selected.publicId] : undefined}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </SectionCard>
  );
}

// Named skeleton twin — a Server Component cannot dot into this "use client"
// module's export (the /dashboard/orders bug).
export function DishesSectionSkeleton() {
  return (
    <SectionCard title="All dishes" subtitle="Browse the catalog — tap a photo for details.">
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1">
            <Skeleton className="aspect-[4/3] w-full rounded-md" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
