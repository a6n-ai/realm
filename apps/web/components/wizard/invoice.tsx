import type { PricingResult } from "@/lib/pricing";
import { Separator } from "@/components/ui/separator";

export function Invoice({ result }: { result: PricingResult | null }) {
  if (!result) return <p className="text-sm text-muted-foreground">Select a meal to see pricing.</p>;
  return (
    <div className="rounded-lg border p-4 text-sm">
      <ul className="space-y-1">
        {result.lineItems.map((li) => (
          <li key={li.label} className="flex justify-between">
            <span>{li.label}</span><span>${li.amount.toFixed(2)}</span>
          </li>
        ))}
        {result.adjustments.map((d) => (
          <li key={d.label} className="flex justify-between text-emerald-600">
            <span>{d.label}</span><span>−${d.amount.toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <Separator className="my-3" />
      <div className="flex justify-between text-muted-foreground">
        <span>{result.tiffinCount} tiffins × ${result.perTiffinPrice.toFixed(2)}</span><span>${result.subtotal.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-base font-semibold">
        <span>Total</span><span>${result.total.toFixed(2)}</span>
      </div>
    </div>
  );
}
