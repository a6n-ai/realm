import { formatMoney as fmt } from "@foundry/commons";
import { Separator } from "@foundry/ui/separator";
import type { PricingResult } from "@/lib/pricing";

// Plain CRM-styled equivalent of components/wizard/invoice.tsx's <Invoice> — that
// component is the public checkout wizard's neo-brutalist "Tiffin Brutal" receipt
// (dashed borders, shadow, emoji), which reads as off-brand next to this page's
// plain shadcn Summary/Payment cards. Same PricingResult data, admin styling.
export function OrderPricingBreakdown({ result, currency }: { result: PricingResult | null; currency: string }) {
  if (!result) return <p className="text-muted-foreground text-sm">No pricing snapshot on this order.</p>;

  return (
    <div className="rounded-lg border p-4 text-sm">
      <ul className="space-y-1.5">
        {result.lineItems.map((li) => (
          <li key={li.label} className="flex justify-between gap-2">
            <span className="text-muted-foreground">{li.label}</span>
            <span className="tabular-nums">{fmt(li.amount, currency)}</span>
          </li>
        ))}
        {result.adjustments.map((d) => (
          <li key={d.label} className="flex justify-between gap-2 text-emerald-600 dark:text-emerald-400">
            <span>{d.label}</span>
            <span className="tabular-nums">−{fmt(d.amount, currency)}</span>
          </li>
        ))}
        {(result.taxLines ?? []).map((t) => (
          <li key={t.name} className="flex justify-between gap-2 text-muted-foreground">
            <span>{t.name} ({t.ratePct}%)</span>
            <span className="tabular-nums">{fmt(t.amount, currency)}</span>
          </li>
        ))}
      </ul>
      <Separator className="my-3" />
      <div className="text-muted-foreground flex justify-between gap-2">
        <span>{result.tiffinCount} tiffins × {fmt(result.perTiffinPrice, currency)}</span>
        <span className="tabular-nums">{fmt(result.subtotal, currency)}</span>
      </div>
      {result.tier.upliftPct > 0 && (
        <p className="text-amber-600 dark:text-amber-500 mt-2 text-xs">
          Order 20+ tiffins for the best per-tiffin rate (currently +{result.tier.upliftPct}%).
        </p>
      )}
      <div className="mt-2 flex items-baseline justify-between gap-2 font-semibold">
        <span>Total</span>
        <span className="tabular-nums text-base">{fmt(result.total, currency)}</span>
      </div>
    </div>
  );
}
