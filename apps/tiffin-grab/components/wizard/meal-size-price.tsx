import { effectivePrice } from "@/lib/pricing";
import type { ClientMealSizeView } from "@/lib/catalog/types";

// Single "was $X now $Y" renderer, imported everywhere a meal size's price is shown
// (subscribe wizard, renew page, public /menu, admin live preview) so the struck-through
// list-price treatment never drifts between them. `priceClassName` lets each call site keep
// its own type scale (compact card vs. larger marketing card) around the same discount math.
export function MealSizePrice({
  meal,
  priceClassName = "text-sm font-medium",
}: {
  meal: Pick<ClientMealSizeView, "basePrice" | "discountType" | "discountValue">;
  priceClassName?: string;
}) {
  if (meal.discountType === "none") {
    return <span className={`nums ${priceClassName}`}>${meal.basePrice.toFixed(2)}</span>;
  }
  const discounted = effectivePrice(meal.basePrice, meal);
  return (
    <span className="nums flex items-baseline gap-1.5">
      <span className="text-muted-foreground text-xs line-through">${meal.basePrice.toFixed(2)}</span>
      <span className={priceClassName}>${discounted.toFixed(2)}</span>
    </span>
  );
}
