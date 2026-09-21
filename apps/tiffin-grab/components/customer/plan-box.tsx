import type { CSSProperties, ReactNode } from "react";
import { Card, Pill } from "@/components/customer/kit";
import { cn } from "@/components/customer/kit/cn";
import { mealChipLabel } from "@/lib/menu/format-tu";
type SubscriptionStatus = "active" | "paused";

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
    <Card className={cn("p-4", className)} style={planBoxStyle(color)}>
      {children}
    </Card>
  );
}

export function DietTag({ label, color }: { label: string; color?: string | null }) {
  const c = color && HEX.test(color) ? color : "#8A8178";
  return (
    <span
      className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold"
      style={{ borderColor: `${c}59`, color: c, backgroundColor: `${c}14` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: c }} />
      {label}
    </span>
  );
}

export function StatusPill({ status }: { status: SubscriptionStatus }) {
  return <Pill tone={status === "active" ? "ok" : "vac"}>{status === "active" ? "Active" : "Paused"}</Pill>;
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

const CHIP = "rounded-full bg-[var(--muted)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)]";

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
