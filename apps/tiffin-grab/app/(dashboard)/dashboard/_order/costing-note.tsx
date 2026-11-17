"use client";

import Link from "next/link";
import { Badge } from "@/components/reui/badge";
import { useFormatMoney } from "@/components/app-currency";
import type { StaffPricePreview } from "./actions";

/** Staff-only cost and margin of the quote, with the discount that still keeps the target margin. */
export function CostingNote({ costing }: { costing: StaffPricePreview["costing"] }) {
  const money = useFormatMoney();
  if (!costing) {
    return (
      <p className="text-muted-foreground text-xs">
        No cost known for this meal size.{" "}
        <Link href="/dashboard/catalog/cost-rates" className="text-primary underline-offset-4 hover:underline">
          Set cost rates
        </Link>
      </p>
    );
  }
  const m = costing.marginPct;
  const tone = m == null || m < costing.minMarginPct ? "destructive-light" : m < costing.targetMarginPct ? "warning-light" : "success-light";
  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">
          Cost {money(costing.cost)} · Selling {money(costing.net)} before tax
        </span>
        <Badge variant={tone}>{m == null ? "No margin" : `Margin ${m}%`}</Badge>
      </div>
      <p className="text-muted-foreground">
        Recommended max staff discount {money(costing.recommendedMaxDiscount)} on top of the coupons and coins already applied (keeps the recommended {costing.targetMarginPct}% margin). Below {costing.minMarginPct}% margin is a loss warning only; you can still apply it.
      </p>
    </div>
  );
}
