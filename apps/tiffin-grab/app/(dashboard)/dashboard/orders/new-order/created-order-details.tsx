"use client";

import type { PricingResult } from "@/lib/pricing";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import { OrderPricingBreakdown } from "../[id]/order-pricing-breakdown";

type Catalog = {
  plans: { key: string; name: string }[];
  mealSizes: { id: string; name: string }[];
  frequencies: { key: string; name: string }[];
};

export type CreatedOrderFacts = {
  deploymentId: string;
  customer: { fullName: string; phone: string; email: string };
  meal: string;
  plan: string;
  schedule: string;
  startDate: string;
  address: string;
  paymentMethod: string | null;
  addons: string[];
};

const DAY: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const money = (n: number) => `$${n.toFixed(2)}`;

export function createdOrderFacts(
  deploymentId: string,
  order: CreateOrderInput,
  catalog: Catalog,
  paymentMethod: string | null,
  addonNames: Record<string, string>,
): CreatedOrderFacts {
  const s = order.selections;
  const trialDays = s.trialDays;
  return {
    deploymentId,
    customer: { fullName: order.contact.fullName, phone: order.contact.phone, email: order.contact.email },
    meal: catalog.mealSizes.find((m) => m.id === s.mealSizeId)?.name ?? "Meal",
    plan: catalog.plans.find((p) => p.key === order.planKey)?.name ?? "",
    schedule: [
      trialDays != null ? `${trialDays} trial ${trialDays === 1 ? "day" : "days"}` : `${s.durationWeeks} ${s.durationWeeks === 1 ? "week" : "weeks"}`,
      catalog.frequencies.find((f) => f.key === s.frequencyKey)?.name,
      s.eatingDays?.length ? `eating ${s.eatingDays.map((d) => DAY[d] ?? d).join(", ")}` : null,
    ].filter(Boolean).join(" · "),
    startDate: s.startDate,
    address: [order.contact.addressLine, order.contact.city, order.contact.postalCode].filter(Boolean).join(", "),
    paymentMethod,
    addons: (s.addonSelections ?? []).map((a) => `${addonNames[a.key] ?? a.key} × ${a.qty}`),
  };
}

/** A WhatsApp-ready recap (*bold* renders there): what was ordered, when it starts, the price, and how to pay. */
export function whatsAppOrderMessage(facts: CreatedOrderFacts, preview: PricingResult | null, payUrl: string | null): string {
  const first = facts.customer.fullName.trim().split(/\s+/)[0];
  return [
    `Hi${first ? ` ${first}` : ""}! Your Tiffin Grab order *${facts.deploymentId}* is created.`,
    "",
    `*Meal:* ${[facts.plan, facts.meal].filter(Boolean).join(" · ")}`,
    ...(facts.addons.length ? [`*Add-ons:* ${facts.addons.join(", ")}`] : []),
    `*Schedule:* ${facts.schedule}`,
    `*Starts:* ${facts.startDate}`,
    `*Delivery to:* ${facts.address}`,
    ...(preview
      ? [
          "",
          ...preview.lineItems.map((l) => `${l.label}: ${money(l.amount)}`),
          ...preview.adjustments.map((a) => `${a.label}: -${money(a.amount)}`),
          ...(preview.taxLines ?? []).map((t) => `${t.name} (${t.ratePct}%): ${money(t.amount)}`),
          `*Total: ${money(preview.total)}*`,
        ]
      : []),
    "",
    payUrl ? `Please pay here to confirm your plan: ${payUrl}` : "Payment received. Your plan is confirmed.",
  ].join("\n");
}

/** What was just created, so staff can read it back to the customer before closing the sheet. */
export function CreatedOrderDetails({ facts, preview, currency }: { facts: CreatedOrderFacts; preview: PricingResult | null; currency: string }) {
  const rows: [string, string][] = [
    ["Customer", [facts.customer.fullName, facts.customer.phone, facts.customer.email].filter(Boolean).join(" · ")],
    ["Meal", [facts.plan, facts.meal].filter(Boolean).join(" · ")],
    ...(facts.addons.length ? ([["Add-ons", facts.addons.join(", ")]] as [string, string][]) : []),
    ["Schedule", facts.schedule],
    ["Starts", facts.startDate],
    ["Delivery", facts.address],
    ...(facts.paymentMethod ? ([["Payment", facts.paymentMethod]] as [string, string][]) : []),
  ];
  return (
    <section className="grid gap-4">
      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {preview && <OrderPricingBreakdown result={preview} currency={currency} />}
    </section>
  );
}
