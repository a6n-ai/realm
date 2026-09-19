import type { PricingResult } from "@/lib/pricing";
import { Separator } from "@foundry/ui/separator";

export function Invoice({ result }: { result: PricingResult | null }) {
  if (!result) return <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Select a meal to see pricing.</p>;
  return (
    <div className="bg-card border-border rounded-[20px] border p-5 text-sm">
      <div className="border-border mb-3 flex items-baseline justify-between border-b pb-2.5">
        <span className="text-[13px] font-semibold">Your tiffin receipt</span>
        <span className="text-base">🧾</span>
      </div>
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
      {/* Receipt order: subtotal, then tax on the discounted base, then total.
          Tax used to print above the subtotal, which read as if it were part of
          the line items rather than applied to them. */}
      <div className="flex justify-between gap-2 text-muted-foreground">
        <span>{result.tiffinCount} {result.tiffinCount === 1 ? "tiffin" : "tiffins"} × ${result.perTiffinPrice.toFixed(2)}</span><span className="nums">${result.subtotal.toFixed(2)}</span>
      </div>
      {(result.taxLines ?? []).length > 0 ? (
        <div className="mt-1 space-y-1">
          {result.taxLines.map((t) => (
            <div key={t.name} className="flex justify-between gap-2 text-muted-foreground">
              <span>{t.name} ({t.ratePct}%)</span><span className="nums">${t.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {result.tier.upliftPct > 0 && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
          Order 20+ tiffins for the best per-tiffin rate (currently +{result.tier.upliftPct}%).
        </p>
      )}
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-base font-bold tracking-wide uppercase">Total</span>
        <span className="nums text-primary text-2xl font-bold">${result.total.toFixed(2)}</span>
      </div>
    </div>
  );
}
