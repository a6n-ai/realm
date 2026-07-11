import type { PricingResult } from "@/lib/pricing";
import { Separator } from "@realm/ui/separator";

export function Invoice({ result }: { result: PricingResult | null }) {
  if (!result) return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Select a meal to see pricing.</p>;
  return (
    <div className="rounded-lg border p-4 text-sm">
      <ul className="space-y-1.5">
        {result.lineItems.map((li) => (
          <li key={li.label} className="flex justify-between gap-2">
            <span className="text-muted-foreground">{li.label}</span><span className="nums">${li.amount.toFixed(2)}</span>
          </li>
        ))}
        {result.adjustments.map((d) => (
          <li key={d.label} className="flex justify-between gap-2 text-emerald-600 dark:text-emerald-400">
            <span>{d.label}</span><span className="nums">−${d.amount.toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <Separator className="my-3" />
      <div className="flex justify-between gap-2 text-muted-foreground">
        <span>{result.tiffinCount} tiffins × ${result.perTiffinPrice.toFixed(2)}</span><span className="nums">${result.subtotal.toFixed(2)}</span>
      </div>
      {result.tier.upliftPct > 0 && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
          Order 20+ tiffins for the best per-tiffin rate (currently +{result.tier.upliftPct}%).
        </p>
      )}
      <div className="mt-2 flex items-baseline justify-between gap-2 text-base font-semibold">
        <span>Total</span><span className="nums text-lg">${result.total.toFixed(2)}</span>
      </div>
    </div>
  );
}
