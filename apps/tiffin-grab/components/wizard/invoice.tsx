"use client";

import type { PricingResult } from "@/lib/pricing";
import { Divider } from "@/components/kit";
import { useFormatMoney } from "@/components/app-currency";

export function Invoice({ result }: { result: PricingResult | null }) {
  const money = useFormatMoney();
  if (!result) return <p className="rounded-2xl bg-foreground/6 p-4 text-sm text-muted-foreground">Select a meal to see pricing.</p>;
  return (
    <div className="c-glass-card rounded-[20px] p-5 text-sm">
      <div className="border-border mb-3 flex items-baseline justify-between border-b pb-2.5">
        <span className="text-footnote font-semibold">Your tiffin receipt</span>
        <span className="text-base">🧾</span>
      </div>
      <ul className="space-y-1.5">
        {result.lineItems.map((li) => (
          <li key={li.label} className="flex justify-between gap-2">
            <span className="text-muted-foreground">{li.label}</span><span className="nums">{money(li.amount)}</span>
          </li>
        ))}
        {result.adjustments.map((d) => (
          <li key={d.label} className="flex justify-between gap-2 text-emerald-600 dark:text-emerald-400">
            <span>{d.label}</span><span className="nums">−{money(d.amount)}</span>
          </li>
        ))}
      </ul>
      <Divider className="my-3" />
      {/* Receipt order: subtotal, then tax on the discounted base, then total.
          Tax used to print above the subtotal, which read as if it were part of
          the line items rather than applied to them. */}
      <div className="flex justify-between gap-2 text-muted-foreground">
        <span>Subtotal</span><span className="nums">{money(result.subtotal)}</span>
      </div>
      {(result.taxLines ?? []).length > 0 ? (
        <div className="mt-1 space-y-1">
          {result.taxLines.map((t) => (
            <div key={t.name} className="flex justify-between gap-2 text-muted-foreground">
              <span>{t.name} ({t.ratePct}%)</span><span className="nums">{money(t.amount)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-base font-bold tracking-wide uppercase">Total</span>
        <span className="nums text-primary text-2xl font-bold">{money(result.total)}</span>
      </div>
    </div>
  );
}
