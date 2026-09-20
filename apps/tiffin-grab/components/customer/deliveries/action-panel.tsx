"use client";
import { CalendarClock, CalendarDays, Palmtree, Pause, Play, Repeat2, Utensils, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ActionRow, Button, Reason } from "@/components/customer/kit";
import { cn, FONT } from "@/components/customer/kit/cn";
import { humanDate, type Trip, type TripAction } from "@/lib/deliveries-view";
import { ACTION_LABEL, type actionModel } from "./action-model";

type Model = ReturnType<typeof actionModel>;
interface Common {
  model: Model;
  trip: Trip;
  tz: string;
  onAction: (a: TripAction) => void;
  onGoTo: (date: string) => void;
}

const ICON: Record<TripAction, ReactNode> = {
  pick: <Utensils className="size-4" />,
  swap: <Repeat2 className="size-4" />,
  hold: <Pause className="size-4" />,
  resume: <Play className="size-4" />,
  move: <CalendarDays className="size-4" />,
  vacation: <Palmtree className="size-4" />,
  makeup: <CalendarClock className="size-4" />,
  pool: <Wallet className="size-4" />,
};

/** Desktop rail: one row per action, each with its when/why line. */
export function ActionRail({ model, onAction, onGoTo, vacation }: Pick<Common, "model" | "onAction" | "onGoTo"> & { vacation: { label: string; sub: string; reason?: string } }) {
  return (
    <div className="space-y-2">
      {model.rows.map((r) => {
        const primary = r.key === model.primary;
        return (
          <ActionRow
            key={r.key}
            label={r.label}
            sublabel={r.av.sub}
            disabledReason={r.av.ok ? undefined : (r.av.why ?? undefined)}
            icon={ICON[r.key]}
            onClick={() => onAction(r.key)}
            className={cn(
              "border border-[var(--border)]",
              primary && r.av.ok && "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground,#fff)] shadow-[0_12px_30px_-8px_color-mix(in_oklch,var(--primary)_70%,transparent)] [&_span]:!text-current active:bg-[var(--primary-hover,var(--primary))]",
            )}
          />
        );
      })}
      {model.rows.length === 0 && (
        <div className="space-y-3 px-1 py-2">
          <Reason>{model.closedReason}</Reason>
          {model.goTo && <Button size="md" variant="outline" onClick={() => onGoTo(model.goTo!)}>Go to {humanDate(model.goTo)}</Button>}
        </div>
      )}
      <div className="my-3 border-t border-dashed border-[var(--border)]" />
      <ActionRow
        label={vacation.label}
        sublabel={vacation.sub}
        disabledReason={vacation.reason}
        icon={ICON.vacation}
        onClick={() => onAction("vacation")}
        className="border border-[var(--border)]"
      />
    </div>
  );
}

/** Mobile thumb-zone bar: one row (primary + up to three secondary). The cutoff line lives in the trip hero so the bar stays short. */
export function ActionBar({ model, onAction, onGoTo }: Common) {
  const [reason, setReason] = useState<string | null>(null);
  const fire = (k: TripAction, a: { ok: boolean; why: string | null }) => (a.ok ? (setReason(null), onAction(k)) : setReason(a.why));
  const primary = model.primary && model.primary !== "vacation" ? model.rows.find((r) => r.key === model.primary) : null;
  return (
    <div
      className={cn(
        FONT,
        "fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-30 border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_92%,transparent)] px-4 pb-2 pt-2 backdrop-blur-xl md:bottom-0 md:pb-[calc(12px+env(safe-area-inset-bottom))] lg:hidden",
      )}
    >
      {reason && <div role="status"><Reason className="mb-2">{reason}</Reason></div>}
      {model.closedReason && <Reason className="mb-2">{model.closedReason}</Reason>}
      {model.goTo && <Button className="w-full" onClick={() => onGoTo(model.goTo!)}>Go to {humanDate(model.goTo)}</Button>}
      <div className="flex items-center gap-2">
        {primary && (
          <Button variant="primary" size="lg" className="min-w-0 flex-1 whitespace-nowrap px-3" onClick={() => fire(primary.key, primary.av)} aria-disabled={!primary.av.ok || undefined}>
            {primary.label}
          </Button>
        )}
        {model.primary === "vacation" && (
          <Button variant="primary" size="lg" className="min-w-0 flex-1 px-3" onClick={() => onAction("vacation")}>Resume deliveries</Button>
        )}
        {model.bar.map((k) => {
          const a = model.av[k];
          return (
            <Button key={k} size="lg" className={cn("w-[72px] shrink-0 px-0", !a.ok && "opacity-45")} aria-disabled={!a.ok || undefined} onClick={() => fire(k, a)}>
              {ACTION_LABEL[k].split(" ")[0]}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
