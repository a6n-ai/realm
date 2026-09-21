"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { PricingResult } from "@/lib/pricing";
import type { WizardSelections } from "@/components/wizard/selections";
import { Divider, Pill } from "@/components/customer/kit";

const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function startLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

const money = (n: number) => `$${n.toFixed(2)}`;

// Display only: every amount comes straight from the server's PricingResult.
export function OrderSummary({
  selections,
  result,
  editHref,
  diet,
  mealName,
  baseline,
  deliveryType,
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
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
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
  const oneLine = [mealName ?? diet, baseline, perWeek > 0 ? `${perWeek}-day delivery` : null, qty ? `${result?.tiffinCount} tiffins` : null].filter(Boolean).join(" · ");

  return (
    <div className="space-y-3">
      <section aria-label="What you're getting" className="bg-card border-border rounded-[20px] border p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">What you&apos;re getting</h3>
          <Link href={editHref} className="text-primary -my-2 -mr-2 inline-flex min-h-11 items-center px-2 text-[13px] font-semibold">Edit</Link>
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="text-muted-foreground mt-1 flex min-h-11 w-full items-center justify-between gap-2 text-left text-[13px] md:hidden"
        >
          <span>{oneLine}</span>
          <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <div className={`${open ? "block" : "hidden"} mt-2 space-y-2 text-[13px] md:mt-1 md:block`}>
          {(mealName || diet) && <p className="text-[15px] font-semibold">{mealName ?? diet}</p>}
          {baseline && <p className="text-muted-foreground">{baseline}</p>}
          {deliveryType && <p className="text-muted-foreground">{deliveryType}</p>}
          {perWeek > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Eating days">
              {days.map((d) => (
                <Pill key={d} tone="save" size="sm" className="!text-[var(--foreground)]">{DAY_LABEL[d] ?? d}</Pill>
              ))}
            </div>
          )}
          {qty && <p className="nums text-muted-foreground">{qty}</p>}
          {start && <p className="text-muted-foreground">Starts {start}</p>}
        </div>
      </section>

      {result ? (
        <section aria-label="Price breakdown" className="bg-card border-border rounded-[20px] border p-4 text-sm">
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
          <div className="text-muted-foreground flex justify-between gap-2"><span>Subtotal</span><span className="nums">{money(result.subtotal)}</span></div>
          {(result.taxLines ?? []).map((t) => (
            <div key={t.name} className="text-muted-foreground mt-1 flex justify-between gap-2">
              <span>{t.name} ({t.ratePct}%)</span><span className="nums">{money(t.amount)}</span>
            </div>
          ))}
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-base font-bold tracking-wide uppercase">Total</span>
            <span className="nums text-primary text-2xl font-bold">{money(result.total)}</span>
          </div>
          {saved > 0 && <p className="nums mt-1 text-right text-xs font-medium text-emerald-600 dark:text-emerald-400">You save {money(saved)}</p>}
          {result.tier.upliftPct > 0 && (
            <p className="text-muted-foreground mt-2 text-xs">Order 20+ tiffins for the best per-tiffin rate (currently +{result.tier.upliftPct}%).</p>
          )}
        </section>
      ) : (
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Select a meal to see pricing.</p>
      )}
      {children}
    </div>
  );
}
