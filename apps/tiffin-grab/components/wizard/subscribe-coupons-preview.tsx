"use client";

import { useAppCurrency } from "@/components/app-currency";
import { formatDiscount } from "@/lib/format/currency";
import { InfoBar } from "@/components/kit";
import { TicketPercentIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import type { AvailableCoupon } from "@/lib/coupons/coupons.service";

function discountLine(c: AvailableCoupon, currency: string): string {
  switch (c.kind) {
    case "percentage":
      return formatDiscount({ valuePct: c.valuePct }, currency);
    case "fixed":
      return formatDiscount({ valueAmount: c.valueAmount }, currency);
    case "first_order":
      return formatDiscount(c, currency);
    case "free_delivery":
      return "Free delivery";
    case "rep_daily":
    case "rep_code":
      return "Special offer";
    default: {
      const _exhaustive: never = c.kind;
      return _exhaustive;
    }
  }
}

export function SubscribeCouponsPreview({ coupons }: { coupons: AvailableCoupon[] }) {
  const currency = useAppCurrency();
  if (coupons.length === 0) return null;
  return (
    <section aria-label="Offers">
      <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {coupons.map((c) => (
          <li key={c.code}>
            <InfoBar tint="orange" icon={<TicketPercentIcon />} action={<span className="text-muted-foreground truncate text-xs">{c.autoApply ? "Applied at checkout" : "Enter it at checkout"}</span>}>
              <span className="font-semibold tracking-wide">{c.code}</span>
              <Badge variant="secondary" className="shrink-0">{discountLine(c, currency)}</Badge>
            </InfoBar>
          </li>
        ))}
      </ul>
    </section>
  );
}
