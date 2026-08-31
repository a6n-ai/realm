import { Badge } from "@foundry/ui/badge";
import type { MealSizeView } from "@/lib/catalog/types";
import { MealSizePrice } from "@/components/wizard/meal-size-price";

// Public Veg/Non-Veg badge is derived from the size's owning plan; other plans
// (e.g. healthy) get no badge.
const PLAN_BADGE: Record<string, string> = { veg: "Veg", "non-veg": "Non-Veg" };

export function MealCard({ meal }: { meal: MealSizeView }) {
  const badge = PLAN_BADGE[meal.planKey];
  return (
    <div className="flex flex-col rounded-lg border p-6">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium">{meal.name}</h3>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </div>
      <p className="text-muted-foreground mt-1 text-sm">{meal.components.join(", ")}</p>
      {meal.description ? <p className="text-muted-foreground mt-1 text-sm text-pretty">{meal.description}</p> : null}
      <div className="text-muted-foreground mt-3 grid grid-cols-2 gap-1 text-xs">
        <span>{meal.kcalMin}–{meal.kcalMax} kcal</span>
        {meal.proteinG != null ? <span>{meal.proteinG} g protein</span> : null}
        {meal.carbsG != null ? <span>{meal.carbsG} g carbs</span> : null}
        {meal.fatG != null ? <span>{meal.fatG} g fat</span> : null}
      </div>
      <div className="mt-4 flex items-baseline gap-1">
        <MealSizePrice meal={meal} priceClassName="text-lg font-semibold" />
        <span className="text-muted-foreground text-sm font-normal">/ meal</span>
      </div>
    </div>
  );
}
