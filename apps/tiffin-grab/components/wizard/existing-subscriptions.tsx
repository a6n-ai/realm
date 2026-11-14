"use client";

import { useAppCurrency } from "@/components/app-currency";
import { formatDiscount } from "@/lib/format/currency";
import { InfoBar } from "@/components/kit";
import Link from "next/link";
import { TicketPercentIcon } from "lucide-react";
import { OrderStatusBadge } from "@/components/ds";
import { Badge } from "@foundry/ui/badge";
import { Reveal } from "@/components/motion";
import type { SubSummary } from "@/lib/deliveries/customer-deliveries.service";
import type { AvailableCoupon } from "@/lib/coupons/coupons.service";

export const CURRENT = new Set(["active", "payment_review", "pending", "waitlisted"]);

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

function Group({ title, subs }: { title: string; subs: SubSummary[] }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Link href="/me" className="text-primary text-xs font-medium">
          Manage →
        </Link>
      </div>
      <Reveal.Group className="c-surface divide-y rounded-3xl bg-card px-4">
        {subs.map((s) => (
          <Reveal key={s.publicId} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm">
                {s.planName} · {s.mealSizeName} · {s.daysPerWeek} delivery days/wk
              </p>
              {s.startDate ? (
                <p className="text-muted-foreground text-xs tabular-nums">Starts {s.startDate}</p>
              ) : null}
            </div>
            <OrderStatusBadge status={s.status} />
          </Reveal>
        ))}
      </Reveal.Group>
    </section>
  );
}

export function ExistingSubscriptions({ subs }: { subs: SubSummary[] }) {
  if (subs.length === 0) return null;
  const current = subs.filter((s) => CURRENT.has(s.status));
  const past = subs.filter((s) => !CURRENT.has(s.status));
  return (
    <div className="space-y-4">
      {current.length > 0 && <Group title="Current plan" subs={current} />}
      {past.length > 0 && <Group title="Past subscriptions" subs={past} />}
    </div>
  );
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
