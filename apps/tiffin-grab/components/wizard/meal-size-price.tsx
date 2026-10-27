import { effectivePrice } from "@/lib/pricing";
import type { ClientMealSizeView } from "@/lib/catalog/types";

// Single "was $X now $Y" renderer, imported everywhere a meal size's price is shown
// (subscribe wizard, renew page, public /menu, admin live preview) so the struck-through
// list-price treatment never drifts between them. `priceClassName` lets each call site keep
// its own type scale (compact card vs. larger marketing card) around the same discount math.
export function MealSizePrice({
  meal,
  priceClassName = "text-sm font-medium",
  perTiffin = false,
  stacked = false,
}: {
  meal: Pick<ClientMealSizeView, "basePrice" | "discountType" | "discountValue">;
  priceClassName?: string;
  /** Appends a small "/tiffin" so a list price is never read as a weekly or monthly total. */
  perTiffin?: boolean;
  /** Price on its own line, right-aligned, with any was-price above and "/tiffin" under it (plan cards). */
  stacked?: boolean;
}) {
  const unit = perTiffin ? <span className="text-muted-foreground text-[13px] font-medium">/tiffin</span> : null;
  if (stacked) {
    return (
      <span className="nums flex shrink-0 flex-col items-end leading-none">
        {meal.discountType !== "none" && <span className="text-muted-foreground mb-1 text-xs line-through">${meal.basePrice.toFixed(2)}</span>}
        <span className={priceClassName}>${(meal.discountType === "none" ? meal.basePrice : effectivePrice(meal.basePrice, meal)).toFixed(2)}</span>
        {unit && <span className="mt-1">{unit}</span>}
      </span>
    );
  }
  if (meal.discountType === "none") {
    return <span className="nums flex items-baseline gap-1"><span className={priceClassName}>${meal.basePrice.toFixed(2)}</span>{unit}</span>;
  }
  const discounted = effectivePrice(meal.basePrice, meal);
  return (
    <span className="nums flex items-baseline gap-1.5">
      <span className="text-muted-foreground text-xs line-through">${meal.basePrice.toFixed(2)}</span>
      <span className={priceClassName}>${discounted.toFixed(2)}</span>
      {unit}
    </span>
  );
}
