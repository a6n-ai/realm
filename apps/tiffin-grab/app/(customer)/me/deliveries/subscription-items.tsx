"use client";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@foundry/ui/select";
import type { Subscription, TiffinCounts } from "@/lib/services/customer-deliveries.service";
import { MealInfoChips, PlanBox, PlanHeadingRow } from "@/components/customer/plan-box";
import { SchedulePoolControl } from "./schedule-pool-control";

/** Meal size is the plan's display name. Diet/plan sits as a coloured tag beside it. */
export function SubscriptionPlanHeader({
  sub,
  allSubscriptions,
  categoryLabels,
  categoryPortions,
  counts,
  today,
  onSwitch,
}: {
  sub: Subscription;
  allSubscriptions: Subscription[];
  categoryLabels: Record<string, string>;
  categoryPortions?: Record<string, string>;
  counts?: TiffinCounts;
  today: string;
  onSwitch: (publicId: string) => void;
}) {
  const showSelector = allSubscriptions.length > 1;
  const dietLabel = sub.tagLabel || sub.planName;

  return (
    <PlanBox color={sub.tagColor}>
      <PlanHeadingRow
        name={
          showSelector ? (
            <Select value={sub.publicId} onValueChange={onSwitch}>
              <SelectTrigger className="h-9 max-w-full min-w-[12rem] bg-background/80 sm:min-w-[18rem]" size="default">
                <SelectValue placeholder="Choose subscription" />
              </SelectTrigger>
              <SelectContent>
                {allSubscriptions.map((s) => (
                  <SelectItem key={s.publicId} value={s.publicId}>
                    {s.mealSizeName}
                    {s.status === "paused" ? " (paused)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <h2 className="text-lg font-semibold leading-snug tracking-tight text-foreground">
              {sub.mealSizeName}
            </h2>
          )
        }
        dietLabel={dietLabel}
        color={sub.tagColor}
        status={sub.status}
      />
      <SubscriptionPlanSummary sub={sub} categoryLabels={categoryLabels} categoryPortions={categoryPortions} />
      {counts && <TiffinCountRow sub={sub} counts={counts} today={today} />}
    </PlanBox>
  );
}

/** Total / delivered / remaining tiffins, plus a "schedule from pool" control when tiffins are owed. */
function TiffinCountRow({
  sub,
  counts,
  today,
}: {
  sub: Subscription;
  counts: TiffinCounts;
  today: string;
}) {
  return (
    <div className="space-y-2 pt-3">
      <dl className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        <Stat label="Total" value={counts.total} />
        <Stat label="Delivered" value={counts.delivered} />
        <Stat label="Remaining" value={counts.remaining} emphasis />
        {counts.holdDays > 0 && <Stat label="Hold days" value={counts.holdDays} />}
        {counts.pooled > 0 && <Stat label="To schedule" value={counts.pooled} emphasis />}
      </dl>
      {counts.pooled > 0 && (
        <SchedulePoolControl orderPublicId={sub.publicId} counts={counts} today={today} />
      )}
    </div>
  );
}

function Stat({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <span className="flex items-baseline gap-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={emphasis ? "font-semibold text-foreground tabular-nums" : "text-foreground tabular-nums"}>
        {value}
      </dd>
    </span>
  );
}

/** What's in the tiffin — chips, not a comma sentence. Meal size is the heading, not repeated here. */
export function SubscriptionPlanSummary({
  sub,
  categoryLabels,
  categoryPortions = {},
}: {
  sub: Subscription;
  categoryLabels: Record<string, string>;
  categoryPortions?: Record<string, string>;
}) {
  return (
    <MealInfoChips
      className="mt-3"
      categoryCounts={sub.categoryCounts}
      categoryLabels={categoryLabels}
      categoryPortions={categoryPortions}
      persons={sub.persons}
    />
  );
}
