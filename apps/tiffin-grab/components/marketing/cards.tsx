import { Badge } from "@realm/ui/badge";
import type { MealSizeView } from "@/lib/catalog/types";

export function StepCard({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="rounded-lg border p-6">
      <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full text-sm font-semibold">{n}</div>
      <h3 className="mt-3 font-medium">{title}</h3>
      <p className="text-muted-foreground mt-1 text-sm">{body}</p>
    </div>
  );
}

// Public Veg/Non-Veg badge is derived from the size's owning plan; other plans
// (e.g. healthy) get no badge.
const PLAN_BADGE: Record<string, string> = { veg: "Veg", "non-veg": "Non-Veg" };

export function MealCard({ meal }: { meal: MealSizeView }) {
  const badge = PLAN_BADGE[meal.planKey];
  return (
    <div className="flex flex-col rounded-lg border p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium">{meal.name}</h3>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </div>
      <p className="text-muted-foreground mt-1 text-sm">{meal.components.join(", ")}</p>
      <div className="text-muted-foreground mt-3 grid grid-cols-2 gap-1 text-xs">
        <span>{meal.kcalMin}–{meal.kcalMax} kcal</span>
        {meal.proteinG != null ? <span>{meal.proteinG} g protein</span> : null}
        {meal.carbsG != null ? <span>{meal.carbsG} g carbs</span> : null}
        {meal.fatG != null ? <span>{meal.fatG} g fat</span> : null}
      </div>
      <div className="mt-4 text-lg font-semibold">${meal.basePrice.toFixed(2)}<span className="text-muted-foreground text-sm font-normal"> / meal</span></div>
    </div>
  );
}
