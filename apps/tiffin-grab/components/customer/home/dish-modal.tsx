"use client";

import type { FileDetail } from "@realm/storage/model";
import { ResponsiveDialog } from "@/components/ds";
import { DishImage } from "./dish-image";

export function DishModal({ dish, daysOnMenu, open, onOpenChange }: {
  dish: { name: string; description: string | null; diet: "veg" | "nonveg"; image: FileDetail | null };
  daysOnMenu?: string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={dish.name}>
      <div className="space-y-3 px-4 pb-4 sm:px-0 sm:pb-0">
        <div className="aspect-video overflow-hidden rounded-lg">
          <DishImage image={dish.image} name={dish.name} />
        </div>
        <p className="text-xs font-medium uppercase text-muted-foreground">{dish.diet === "veg" ? "Veg" : "Non-veg"}</p>
        {dish.description ? <p className="text-sm">{dish.description}</p> : null}
        {daysOnMenu?.length ? <p className="text-sm text-muted-foreground">On the menu: {daysOnMenu.join(", ")}</p> : null}
      </div>
    </ResponsiveDialog>
  );
}
