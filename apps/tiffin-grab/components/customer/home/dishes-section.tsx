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

export function DishesSection({ dishes, daysByDish }: { dishes: CustomerDish[]; daysByDish?: Record<string, string[]> }) {
  const [selected, setSelected] = useState<CustomerDish | null>(null);

  if (dishes.length === 0) {
    return (
      <SectionCard title="Dishes">
        <LottieEmptyState animation="empty-box" title="No dishes to show yet" />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Dishes">
      <Reveal.Group className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {dishes.map((dish) => (
          <Reveal key={dish.publicId}>
            <Pressable
              type="button"
              aria-label={dish.name}
              title={dish.name}
              onClick={() => setSelected(dish)}
              className="flex w-full flex-col gap-1 rounded-lg text-left"
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-lg">
                <DishImage image={dish.image} name={dish.name} />
                <span
                  className={cn(
                    "absolute right-1.5 top-1.5 size-2.5 rounded-full ring-2 ring-white/80",
                    dietDotClass(dish.diet, dish.name),
                  )}
                />
              </div>
              <span className="mt-1 block truncate text-xs font-medium">{dish.name}</span>
            </Pressable>
          </Reveal>
        ))}
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
    <SectionCard title="Dishes">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
