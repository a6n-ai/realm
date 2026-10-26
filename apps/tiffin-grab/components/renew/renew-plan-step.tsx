"use client";

import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { Button, Card, Notice, Pill } from "@/components/customer/kit";
import { buttonClass } from "@/components/customer/kit/button-class";
import { pickedAddons } from "@/components/wizard/selections";
import { StepDuration } from "@/components/wizard/steps/step-duration";
import type { CurrentPlanSummary } from "@/components/wizard/current-plan-hint";
import type { useQuickRenew } from "./use-quick-renew";
import type { QuickRenewData } from "./types";

const HEX = /^#[0-9a-fA-F]{6}$/;
const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

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
      <Card aria-label="Your plan" data-testid="plan-card" className="px-4 py-4" style={color ? { borderLeft: `4px solid ${color}` } : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="c-h2">{q.meal?.name ?? "Your plan"}</p>
          {diet && <Pill tone="soft" size="sm">{diet}</Pill>}
        </div>
        <p className="c-caption mt-1">{(sel.eatingDays ?? []).map((d) => DAY_LABEL[d] ?? d).join(", ")}</p>
        {picked.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Add-ons">
            {picked.map((a) => <Pill key={a.name} tone="soft" size="sm">{a.name}{a.qty > 1 ? ` ×${a.qty}` : ""}</Pill>)}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {q.addons.length > 0 && (
            <Button variant="quiet" pill onClick={onOpenAddons}>
              <PlusIcon aria-hidden className="size-4" />
              {picked.length > 0 ? "Edit add-ons" : "Add-ons"}
            </Button>
          )}
          <Link href={changePlanHref} className={buttonClass({ variant: "quiet", pill: true })}>Change meal or days</Link>
        </div>
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
