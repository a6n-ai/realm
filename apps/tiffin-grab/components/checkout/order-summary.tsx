import type { ReactNode } from "react";
import Link from "next/link";
import type { PricingResult } from "@/lib/pricing";
import type { WizardSelections } from "@/components/wizard/selections";
import { Divider, Pill } from "@/components/customer/kit";

const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function startLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export const money = (n: number) => `$${n.toFixed(2)}`;

// Display only: every amount comes straight from the server's PricingResult.
export function OrderSummary({
  selections,
  result,
  editHref,
  diet,
  mealName,
  baseline,
  deliveryType,
  plain = false,
  children,
}: {
  selections: WizardSelections;
  result: PricingResult | null;
  editHref: string;
  diet?: string;
  mealName?: string | null;
  /** Plan/baseline name, e.g. Veg. */
  baseline?: string | null;
  /** e.g. "3-day delivery · Mon Wed Fri". */
  deliveryType?: string | null;
  /** Inside a sheet that already has the card surface and the "Your order" title. */
  plain?: boolean;
  children?: ReactNode;
}) {
  const days = [...(selections.eatingDays ?? [])].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const weeks = selections.durationWeeks;
  const perWeek = days.length;
  const start = startLabel(selections.startDate);
  const saved = result ? result.adjustments.reduce((s, a) => s + a.amount, 0) : 0;
  const qty = result
    ? perWeek > 0 && weeks > 0
      ? `${perWeek} tiffins a week × ${weeks} ${weeks === 1 ? "week" : "weeks"} = ${result.tiffinCount} tiffins`
      : `${result.tiffinCount} tiffins`
    : null;

  return (
    <section aria-label="Your order" className={plain ? undefined : "bg-card border-border rounded-[24px] border p-5"}>
      <div className="flex items-center justify-between gap-2">
        {plain ? <span /> : <h2 className="text-muted-foreground text-[13px] font-semibold tracking-[0.02em]">Your order</h2>}
        <Link href={editHref} transitionTypes={["nav-back"]} className="text-primary -my-2 -mr-2 inline-flex min-h-11 items-center px-2 text-[13px] font-semibold">Edit</Link>
      </div>
      <div className="mt-1 space-y-2 text-[13px]">
        {(mealName || diet) && <p className="text-[22px] leading-tight font-bold tracking-[-0.03em]">{mealName ?? diet}</p>}
        {baseline && <p className="text-muted-foreground">{baseline}</p>}
        {deliveryType && <p className="text-muted-foreground">{deliveryType}</p>}
        {perWeek > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5" aria-label="Eating days">
            {days.map((d) => (
              <Pill key={d} tone="save" size="sm" className="!text-[var(--foreground)]">{DAY_LABEL[d] ?? d}</Pill>
            ))}
          </div>
        )}
        {qty && <p className="nums font-medium">{qty}</p>}
        {result?.deliveryCount ? (
          <p className="nums text-muted-foreground">
            {result.deliveryCount} {result.deliveryCount === 1 ? "delivery" : "deliveries"}
            {result.deliveryCount < result.tiffinCount ? " · some tiffins share a trip" : ""}
          </p>
        ) : null}
        {start && <p className="text-muted-foreground">Starts {start}</p>}
      </div>

      <Divider className="my-4" />

      {result ? (
        <div aria-label="Price breakdown" className="text-sm">
          <ul className="space-y-1.5">
            {result.lineItems.map((li) => (
              <li key={li.label} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{li.label}</span><span className="nums">{money(li.amount)}</span>
              </li>
            ))}
          </ul>
          {/* Subtotal is before discounts, so it sits above them. */}
          <div className="text-muted-foreground mt-3 flex justify-between gap-2"><span>Subtotal</span><span className="nums">{money(result.subtotal)}</span></div>
          {result.adjustments.length > 0 && (
            <ul className="mt-1.5 space-y-1.5">
              {result.adjustments.map((d) => (
                <li key={d.label} className="flex justify-between gap-2 text-emerald-700 dark:text-emerald-400">
                  <span>{d.label}</span><span className="nums">−{money(d.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {(result.taxLines ?? []).map((t) => (
            <div key={t.name} className="text-muted-foreground mt-1 flex justify-between gap-2">
              <span>{t.name} ({t.ratePct}%)</span><span className="nums">{money(t.amount)}</span>
            </div>
          ))}
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <span className="text-[15px] font-semibold">Total</span>
            <span className="nums text-primary text-[28px] leading-none font-bold tracking-[-0.03em]">{money(result.total)}</span>
          </div>
          {saved > 0 && <p className="nums mt-1.5 text-right text-xs font-semibold text-emerald-700 dark:text-emerald-400">You save {money(saved)}</p>}
          {result.tier.upliftPct > 0 && (
            <p className="text-muted-foreground mt-3 text-xs text-pretty">Order 20+ tiffins for the best per-tiffin rate (currently +{result.tier.upliftPct}%).</p>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Working out your price…</p>
      )}
      {children}
    </section>
  );
}
