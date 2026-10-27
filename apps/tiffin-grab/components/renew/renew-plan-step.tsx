"use client";

import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { Button, Card, Notice, Pill } from "@/components/customer/kit";
import { pickedAddons } from "@/components/wizard/selections";
import { StepDuration } from "@/components/wizard/steps/step-duration";
import type { CurrentPlanSummary } from "@/components/wizard/current-plan-hint";
import type { useQuickRenew } from "./use-quick-renew";
import type { QuickRenewData } from "./types";

const HEX = /^#[0-9a-fA-F]{6}$/;
const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const WEEK = Object.keys(DAY_LABEL);

/** "5 days a week · Mon–Fri"; a gap in the run lists the days ("3 days a week · Mon, Wed, Fri"). */
function daysLine(days: readonly string[]): string {
  const idx = days.map((d) => WEEK.indexOf(d)).sort((a, b) => a - b);
  const run = idx.length >= 3 && idx.every((d, i) => i === 0 || d === idx[i - 1]! + 1);
  const list = run ? `${DAY_LABEL[WEEK[idx[0]!]!]}–${DAY_LABEL[WEEK[idx.at(-1)!]!]}` : idx.map((i) => DAY_LABEL[WEEK[i]!]).join(", ");
  return `${days.length} ${days.length === 1 ? "day" : "days"} a week · ${list}`;
}

/** Quick renew's Plan step body: the plan card, weeks and start date. Checkout supplies the frame, heading and Continue. */
export function RenewPlanStep({ q, data, changePlanHref, onOpenAddons }: {
  q: ReturnType<typeof useQuickRenew>;
  data: QuickRenewData;
  changePlanHref: string;
  onOpenAddons: () => void;
}) {
  const { sel, set, catalog, price } = q;
  const picked = pickedAddons(catalog, sel);
  const color = data.tagColor && HEX.test(data.tagColor) ? data.tagColor : null;
  const diet = data.tagLabel || q.plan?.name;
  // StepDuration reads this as "a plan is running" and explains why the start date sits after it.
  const currentPlan: CurrentPlanSummary | null = data.minStartDate
    ? { planName: q.plan?.name ?? "", mealSizeName: q.meal?.name ?? "", daysPerWeek: (sel.eatingDays ?? []).length, status: "active", startDate: "" }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <Card aria-label="Your plan" data-testid="plan-card" className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <p className="c-h2 min-w-0">{q.meal?.name ?? "Your plan"}</p>
          {/* iOS "Edit"-style text button: the card stays the focus, changing it is one quiet tap away. */}
          <Link href={changePlanHref} className="text-primary -my-2 -mr-2 flex min-h-11 shrink-0 items-center rounded-full px-2 text-[15px] font-semibold">Change</Link>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {diet && (
            <Pill tone="soft" size="sm" style={color ? { background: `color-mix(in oklch, ${color} 22%, transparent)`, color: `color-mix(in oklch, ${color} 70%, var(--foreground))` } : undefined}>{diet}</Pill>
          )}
          <span className="c-caption">{daysLine(sel.eatingDays ?? [])}</span>
        </div>
        {picked.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Add-ons">
            {picked.map((a) => <Pill key={a.name} tone="soft" size="sm">{a.name}{a.qty > 1 ? ` ×${a.qty}` : ""}</Pill>)}
          </div>
        )}
        {q.addons.length > 0 && (
          <Button variant="quiet" pill className="mt-3" onClick={onOpenAddons}>
            <PlusIcon aria-hidden className="size-4" />
            {picked.length > 0 ? "Edit add-ons" : "Add-ons"}
          </Button>
        )}
      </Card>

      <StepDuration
        catalog={catalog}
        selections={sel}
        set={set}
        result={price.result}
        currentPlan={currentPlan}
        minStartDate={data.minStartDate}
        lastTiffin={data.lastTiffin}
        holidayDates={data.holidayDates}
      />

      {price.error && (
        <Notice tone="error">
          <span className="flex items-center gap-2">{price.error}<Button variant="quiet" pill onClick={q.retry}>Retry</Button></span>
        </Notice>
      )}
      {q.submitError && <Notice tone="error">{q.submitError}</Notice>}
    </div>
  );
}
