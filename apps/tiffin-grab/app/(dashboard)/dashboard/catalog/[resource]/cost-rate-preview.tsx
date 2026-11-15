"use client";

import { useFormatMoney } from "@/components/app-currency";
import { formatTuHuman } from "@/lib/menu/format-tu";
import type { EditorExtras } from "@/lib/catalog/resource-hooks";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Live cost of one item at each portion size the meal sizes use, so staff can check it against their cost sheet. */
export function CostRatePreview({ values, preview }: { values: Record<string, unknown>; preview: EditorExtras["costPreview"] }) {
  const money = useFormatMoney();
  const cat = preview?.[String(values.category ?? "")];
  const base = num(values.costBase);
  const perTu = num(values.costPerTu);

  return (
    <div className="border-border/70 bg-muted/30 sm:col-span-2 -mx-5 -mb-5 mt-1 flex flex-col gap-3 border-t px-5 py-4">
      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Cost preview</p>
      {cat ? (
        <ul className="flex max-w-sm flex-col gap-1 text-sm">
          {cat.tus.map((tu) => (
            <li key={tu} className="flex justify-between gap-4 tabular-nums">
              <span>
                {cat.label} {formatTuHuman(cat.unit, tu)}
                <span className="text-muted-foreground"> · {tu} TU</span>
              </span>
              <span className="text-muted-foreground">
                {money(base)} + {money(perTu)} × {tu} = <span className="text-foreground font-medium">{money(base + perTu * tu)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">Pick a category to see the cost at each portion size your meal sizes use.</p>
      )}
      <p className="text-muted-foreground text-xs">
        Cost per pick is a fixed amount for each item, whatever its size (the $0.55 meat in non-veg sabzi). Cost per TU grows with the portion (8oz
        sabzi $2.20, 12oz $3.30). Use both when your sheet&apos;s sizes don&apos;t scale evenly.
      </p>
    </div>
  );
}
