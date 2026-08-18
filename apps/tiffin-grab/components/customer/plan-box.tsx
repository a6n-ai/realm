import type { CSSProperties, ReactNode } from "react";
import { cn } from "@realm/ui/cn";
import { PlanTags } from "@/components/customer/home/plan-tags";
import { mealChipLabel } from "@/lib/menu/format-tu";
import { SUB_STATUS_LABEL, TONE_CLASS, type SubscriptionStatus } from "@/app/(customer)/me/deliveries/calendar-constants";

const HEX = /^#[0-9a-fA-F]{6}$/;

export function planBoxStyle(hex: string | null | undefined): CSSProperties | undefined {
  if (!hex || !HEX.test(hex)) return undefined;
  return {
    backgroundColor: `${hex}14`,
    borderColor: `${hex}59`,
  };
}

export function PlanBox({
  color,
  className,
  children,
}: {
  color?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4", className)} style={planBoxStyle(color)}>
      {children}
    </div>
  );
}

export function DietTag({ label, color }: { label: string; color?: string | null }) {
  return <PlanTags tags={[{ label, color: color && HEX.test(color) ? color : "#8A8178" }]} />;
}

export function StatusPill({ status }: { status: SubscriptionStatus }) {
  const tone = status === "active" ? "ok" : "warn";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", TONE_CLASS[tone])}>
      {SUB_STATUS_LABEL[status]}
    </span>
  );
}

/** `[Meal size] [diet pill] .............. [optional trailing] [Active pill]` */
export function PlanHeadingRow({
  name,
  dietLabel,
  color,
  status,
  trailing,
}: {
  name: ReactNode;
  dietLabel: string;
  color?: string | null;
  status: string;
  trailing?: ReactNode;
}) {
  const pillStatus: SubscriptionStatus = status === "paused" ? "paused" : "active";
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {name}
        <DietTag label={dietLabel} color={color} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {trailing}
        <StatusPill status={pillStatus} />
      </div>
    </div>
  );
}

const CHIP = "rounded-full bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground";

/** What's in the tiffin — chips, not a comma sentence. Meal size is the heading, not repeated here. */
export function MealInfoChips({
  categoryCounts,
  categoryLabels,
  categoryPortions = {},
  persons = 1,
  className,
}: {
  categoryCounts: Record<string, number>;
  categoryLabels: Record<string, string>;
  categoryPortions?: Record<string, string>;
  persons?: number;
  className?: string;
}) {
  const entries = Object.entries(categoryCounts).filter(([, qty]) => qty > 0);
  if (entries.length === 0 && persons <= 1) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {entries.map(([key, qty]) => (
        <span key={key} className={CHIP}>
          {mealChipLabel(qty, categoryLabels[key] ?? key, categoryPortions[key])}
        </span>
      ))}
      {persons > 1 ? <span className={CHIP}>{persons} persons</span> : null}
    </div>
  );
}
