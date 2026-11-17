"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/reui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@foundry/ui/card";
import { useFormatMoney } from "@/components/app-currency";
import type { StaffPricePreview } from "./actions";

function Row({ label, children, strong = false }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? "font-medium" : ""}`}>
      <span className={strong ? undefined : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

/** Staff-only cost and margin of the quote, with the discount that still keeps the target margin. */
export function CostingNote({ costing }: { costing: StaffPricePreview["costing"] }) {
  const money = useFormatMoney();
  if (!costing) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>Margin</CardTitle>
          <CardDescription>
            No cost known for this meal size.{" "}
            <Link href="/dashboard/catalog/cost-rates" className="text-primary underline-offset-4 hover:underline">
              Set cost rates
            </Link>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const m = costing.marginPct;
  const tone = m == null || m < costing.minMarginPct ? "destructive-light" : m < costing.targetMarginPct ? "warning-light" : "success-light";
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Margin</CardTitle>
        <CardDescription>After every coupon and coins, before tax</CardDescription>
        <CardAction>
          <Badge variant={tone}>{m == null ? "No margin" : `${m}%`}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-col gap-1.5">
          <Row label="Selling">{money(costing.net)}</Row>
          <Row label="Cost">{money(costing.cost)}</Row>
          <Row label="Profit" strong>{money(costing.net - costing.cost)}</Row>
        </div>
        <div className="flex flex-col gap-1 border-t pt-3">
          <Row label="Max staff discount" strong>{money(costing.recommendedMaxDiscount)}</Row>
          <p className="text-muted-foreground text-xs">
            Keeps the {costing.targetMarginPct}% target margin on top of the coupons and coins already applied. Below {costing.minMarginPct}% is a loss warning only; you can still apply it.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
