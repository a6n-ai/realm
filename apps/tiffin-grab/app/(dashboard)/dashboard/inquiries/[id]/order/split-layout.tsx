"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@foundry/ui/collapsible";
import { parseIsoDateUtc } from "@foundry/commons";
import { Badge } from "@/components/reui/badge";
import type { Draft } from "@/app/(dashboard)/dashboard/orders/new-order/order-sections";
import type { Catalog } from "./order-draft";
import type { EnabledSlot } from "./use-order-draft";

const lg = "(min-width: 1024px)";

/** True at Tailwind `lg` and up; false on the server and first paint, so split falls back to stacked. */
export function useIsLg(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(lg);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(lg).matches,
    () => false,
  );
}

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function daysLabel(days: readonly string[]): string {
  const sorted = DAY_ORDER.filter((x) => days.includes(x));
  if (sorted.length === 5 && sorted.join() === DAY_ORDER.slice(0, 5).join()) return "Mon–Fri";
  return sorted.map(cap).join(", ");
}

function dateLabel(iso: string): string {
  if (!iso) return "";
  return parseIsoDateUtc(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
}

type SectionKey = "plan" | "delivery" | "payment" | "discounts";

const SECTION_FIELDS: Record<Exclude<SectionKey, "discounts">, readonly string[]> = {
  plan: ["planKey", "mealSizeId", "frequencyKey", "eatingDays", "persons", "mealSlots", "includeSaturday", "includeSunday", "durationWeeks", "startDate", "addonSelections"],
  delivery: ["addressLine", "city", "postalCode"],
  payment: [],
};
const MAPPED = new Set(Object.values(SECTION_FIELDS).flat());

/** Which sections hold something missing or invalid, from the draft's `missing` labels and field errors. */
export function sectionsNeedingInput(d: Draft): Record<SectionKey, boolean> {
  const errs = Object.keys(d.form.formState.errors);
  const m = d.missing;
  const has = (k: Exclude<SectionKey, "discounts">) => errs.some((f) => SECTION_FIELDS[k].includes(f));
  // An error on a field no row owns: open every row so it can never hide behind a collapsed one.
  const stray = errs.some((f) => !MAPPED.has(f) && f !== "phone" && f !== "email");
  return {
    plan: stray || has("plan") || m.some((x) => x === "meal size" || x === "start date" || x === "a start date on a trial day"),
    delivery: stray || has("delivery") || m.some((x) => x === "address" || x === "city" || x === "postal code"),
    payment: stray || m.includes("payment method"),
    discounts: stray,
  };
}

/** One-line summaries read from the draft's current values; display only. */
export function sectionSummaries(d: Draft, catalog: Catalog, enabledSlots: EnabledSlot[], fmtMoney: (n: number) => string) {
  const v = d.form.watch();
  const planName = catalog.plans.find((p) => p.key === v.planKey)?.name;
  const size = catalog.mealSizes.find((s) => s.id === v.mealSizeId)?.name;
  const persons = Number(v.persons);
  const weeks = Number(v.durationWeeks);
  const plan = [
    planName,
    size,
    persons ? `${persons} ${persons === 1 ? "person" : "persons"}` : null,
    v.eatingDays?.length ? daysLabel(v.eatingDays) : null,
    weeks ? `${weeks} ${weeks === 1 ? "week" : "weeks"}` : null,
    v.startDate ? `starts ${dateLabel(v.startDate)}` : null,
  ].filter(Boolean).join(" · ") || "Not set";

  const slots = (v.mealSlots ?? []).map((k) => enabledSlots.find((s) => s.key === k)?.label ?? k).join(", ");
  const address = [v.addressLine, v.city, v.postalCode].filter(Boolean).join(", ");
  const delivery = [address, slots].filter(Boolean).join(" · ") || "No address yet";

  const method = d.paymentMethods.find((m) => m.id === d.paymentMethodId)?.label;
  const payment = d.paymentMethods.length === 0 ? "No payment methods set up" : method ?? "Not set";

  const parts = [
    ...d.couponCodes,
    (d.coinPreview?.used ?? 0) > 0 && `${d.coinPreview?.used} coins`,
    d.discount > 0 && `${fmtMoney(d.discount)} off`,
  ].filter(Boolean);
  const discounts = parts.length ? parts.join(", ") : "None";

  return { plan, delivery, payment, discounts };
}

/** A section collapsed to its title + one-line summary; opens to the real section. Starts open when it needs input. */
export function SummaryRow({ title, summary, needsInput, children }: { title: string; summary: string; needsInput: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(needsInput);
  useEffect(() => {
    if (needsInput) setOpen(true);
  }, [needsInput]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border">
      <CollapsibleTrigger asChild>
        <button type="button" className="group hover:bg-muted/50 flex w-full items-center gap-3 p-3 text-left transition-colors">
          <span className="grid min-w-0 flex-1 gap-0.5">
            {/* Open: the section below carries its own title, so the row shows only the summary. */}
            {open ? null : (
              <span className="flex items-center gap-2 text-sm font-medium">
                {title}
                {needsInput && <Badge variant="warning-light">Needs input</Badge>}
              </span>
            )}
            <span className="text-muted-foreground truncate text-sm">{summary}</span>
          </span>
          <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t p-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
