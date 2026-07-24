"use client";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@realm/ui/select";
import type { Subscription, TiffinCounts } from "@/lib/services/customer-deliveries.service";
import { SUB_STATUS_LABEL, type SubscriptionStatus } from "./calendar-constants";
import { SchedulePoolControl } from "./schedule-pool-control";

/** Plan name + status; dropdown only when the customer has multiple active subs. */
export function SubscriptionPlanHeader({
  sub,
  allSubscriptions,
  categoryLabels,
  counts,
  today,
  onSwitch,
}: {
  sub: Subscription;
  allSubscriptions: Subscription[];
  categoryLabels: Record<string, string>;
  counts?: TiffinCounts;
  today: string;
  onSwitch: (publicId: string) => void;
}) {
  const showSelector = allSubscriptions.length > 1;
  const statusLabel = SUB_STATUS_LABEL[sub.status as SubscriptionStatus];

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {showSelector ? (
          <Select value={sub.publicId} onValueChange={onSwitch}>
            <SelectTrigger className="h-9 max-w-full min-w-[12rem] sm:min-w-[18rem]" size="default">
              <SelectValue placeholder="Choose subscription" />
            </SelectTrigger>
            <SelectContent>
              {allSubscriptions.map((s) => (
                <SelectItem key={s.publicId} value={s.publicId}>
                  {s.planName}
                  {s.status === "paused" ? " (paused)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <h2 className="text-base font-semibold leading-snug tracking-tight text-foreground">
            {sub.planName}
          </h2>
        )}
        <span className="text-muted-foreground text-xs">{statusLabel}</span>
      </div>
      <SubscriptionPlanSummary sub={sub} categoryLabels={categoryLabels} />
      {counts && <TiffinCountRow sub={sub} counts={counts} today={today} />}
    </div>
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
      <dl className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        <Stat label="Total" value={counts.total} />
        <Stat label="Delivered" value={counts.delivered} />
        <Stat label="Remaining" value={counts.remaining} emphasis />
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

/** One-line plan summary — meal size, item counts, persons. No chips/pills. */
export function SubscriptionPlanSummary({
  sub,
  categoryLabels,
}: {
  sub: Subscription;
  categoryLabels: Record<string, string>;
}) {
  const entries = Object.entries(sub.categoryCounts).filter(([, qty]) => qty > 0);
  const segments: string[] = [];

  if (sub.mealSizeName) segments.push(sub.mealSizeName);

  if (entries.length > 0) {
    const items = entries
      .map(([key, qty]) => `${qty}× ${categoryLabels[key] ?? key}`)
      .join(", ");
    segments.push(items);
  }

  if (sub.persons > 1) segments.push(`${sub.persons} persons`);

  if (segments.length === 0) return null;

  return (
    <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
      {segments.join(" · ")}
    </p>
  );
}
