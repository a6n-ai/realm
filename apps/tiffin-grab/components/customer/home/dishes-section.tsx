"use client";

import { useState } from "react";
import { Skeleton } from "@realm/ui/skeleton";
import { cn } from "@realm/ui/cn";
import { SectionCard } from "@/components/ds";
import { Reveal, Pressable, LottieEmptyState } from "@/components/motion";
import { dietDotClass } from "@/lib/menu/poster";
import type { CustomerDish } from "@/lib/services/dishes.service";
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
                    "relative w-full overflow-hidden rounded-md outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10",
                    dense ? "aspect-[4/3]" : "aspect-square rounded-lg",
                  )}
                >
                  <DishImage image={dish.image} name={dish.name} sizes={dense ? "120px" : "200px"} />
                  <span
                    className={cn(
                      "absolute rounded-full ring-2 ring-white/80",
                      dense ? "right-1 top-1 size-2" : "right-1.5 top-1.5 size-2.5",
                      dietDotClass(dish.diet, dish.name),
                    )}
                  />
                  {onMenu && onMenu.length > 0 ? (
                    <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 py-0.5 text-[9px] font-medium tracking-wide text-white uppercase">
                      This week
                    </span>
                  ) : null}
                </div>
                {/* Caption only when photo exists — gradient tiles already print the name. */}
                {dish.image?.url ? (
                  <span className={cn("block truncate font-medium", dense ? "text-[11px] leading-tight" : "mt-1 text-xs")}>
                    {dish.name}
                  </span>
                ) : null}
              </Pressable>
            </Reveal>
          );
        })}
      </Reveal.Group>

      <DishModal
        dish={{
          name: selected?.name ?? "",
          description: selected?.description ?? null,
          diet: selected?.diet ?? "veg",
          image: selected?.image ?? null,
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
