"use client";

import Link from "next/link";
import { TicketPercentIcon } from "lucide-react";
import { OrderStatusBadge } from "@/components/ds";
import { Badge } from "@realm/ui/badge";
import { Reveal } from "@/components/motion";
import { KIND_LABELS } from "@/app/(dashboard)/dashboard/discounts/kind-labels";
import type { SubSummary } from "@/lib/services/customer-deliveries.service";
import type { AvailableCoupon } from "@/lib/services/coupons.service";

const CURRENT = new Set(["active", "paused", "waitlisted", "pending"]);

function discountLine(c: AvailableCoupon): string {
  switch (c.kind) {
    case "percentage":
      return `${Number(c.valuePct)}% off`;
    case "fixed":
      return `$${Number(c.valueAmount)} off`;
    case "first_order":
      return c.valuePct != null ? `${Number(c.valuePct)}% off` : `$${Number(c.valueAmount)} off`;
    case "free_delivery":
      return "Free delivery";
    case "rep_daily":
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
        <Link href="/me/deliveries" className="text-primary text-xs font-medium">
          Manage →
        </Link>
      </div>
      <Reveal.Group className="divide-y rounded-lg border px-3">
        {subs.map((s) => (
          <Reveal key={s.publicId} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm">
                {s.planName} · {s.mealSizeName} · {s.daysPerWeek} days/wk
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

export function ExistingSubscriptions({
  subs,
  onePlanMode,
}: {
  subs: SubSummary[];
  /** Live plan exists — copy explains one-sub + meal picks on calendar. */
  onePlanMode?: boolean;
}) {
  if (subs.length === 0) return null;
  const current = subs.filter((s) => CURRENT.has(s.status));
  const past = subs.filter((s) => !CURRENT.has(s.status));
  return (
    <div className="space-y-4">
      {onePlanMode && current.length > 0 ? (
        <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm text-pretty">
          Your calendar is tied to this plan. Pick dishes per delivery day from Deliveries — you
          don&apos;t need a second subscription.
        </p>
      ) : null}
      {current.length > 0 && <Group title="Current plan" subs={current} />}
      {past.length > 0 && <Group title="Past subscriptions" subs={past} />}
    </div>
  );
}

export function SubscribeCouponsPreview({ coupons }: { coupons: AvailableCoupon[] }) {
  if (coupons.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Coupons you can apply at checkout</h2>
      <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {coupons.map((c) => (
          <li
            key={c.code}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
          >
            <TicketPercentIcon className="text-primary size-4 shrink-0" aria-hidden />
            <span className="font-medium tracking-wide">{c.code}</span>
            <span className="text-muted-foreground truncate text-xs">{c.name}</span>
            <Badge variant="secondary" className="ml-auto shrink-0 text-[0.65rem]">
              {discountLine(c)}
            </Badge>
            <span className="sr-only">{KIND_LABELS[c.kind]}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">Enter a code on the checkout step to apply it.</p>
    </section>
  );
}
