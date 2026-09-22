"use client";
import { useState } from "react";
import { Button, Reason } from "@/components/customer/kit";
import { cn, FONT } from "@/components/customer/kit/cn";
import { humanDate, type TripAction } from "@/lib/deliveries-view";
import { ACTION_LABEL, ACTION_SHORT, type actionModel } from "./action-model";

type Model = ReturnType<typeof actionModel>;
interface Props {
  model: Model;
  layout: "card" | "bar";
  onAction: (a: TripAction) => void;
  onGoTo: (date: string) => void;
}

/** Edit meal (or Resume) is the one primary; the rest are a quiet row. Disabled actions stay tappable and answer in plain words. */
export function TripActions({ model, layout, onAction, onGoTo }: Props) {
  const [reason, setReason] = useState<string | null>(null);
  const bar = layout === "bar";
  const fire = (k: TripAction, a: { ok: boolean; why: string | null }) => (a.ok ? (setReason(null), onAction(k)) : setReason(a.why));
  const primary = model.primary === "vacation" ? null : model.rows.find((r) => r.key === model.primary);
  const held = model.primary === "resume";
  // On hold, Pick and Swap can only say "resume first"; the trip card already says so in words.
  const secondary = model.rows.filter((r) => r.key !== model.primary && r.key !== "pick" && !(held && r.key === "swap"));

  if (model.rows.length === 0 && model.primary !== "vacation") {
    if (!model.goTo) return null;
    return (
      <div className={cn(FONT, "space-y-3")}>
        {model.goTo && <Button variant="primary" size="lg" className="w-full" onClick={() => onGoTo(model.goTo!)}>Go to {humanDate(model.goTo)}</Button>}
      </div>
    );
  }
  const btn = (k: TripAction, a: { ok: boolean; why: string | null }, label: string) => (
    <Button
      key={k}
      size={bar ? "lg" : "md"}
      aria-label={ACTION_LABEL[k]}
      aria-disabled={!a.ok || undefined}
      className={cn(bar ? "min-w-0 flex-1 px-1" : "px-5", !a.ok && "opacity-45")}
      onClick={() => fire(k, a)}
    >
      {label}
    </Button>
  );
  return (
    <div className={cn(FONT, bar ? "space-y-2" : "space-y-3")}>
      {reason && <div role="status"><Reason>{reason}</Reason></div>}
      <div className={cn("flex gap-2", !bar && "flex-col")}>
        {model.primary === "vacation" && <Button variant="primary" size="lg" className={cn(bar ? "min-w-0 flex-[2]" : "w-full")} onClick={() => onAction("vacation")}>Resume deliveries</Button>}
        {primary && (
          <Button
            variant="primary"
            size="lg"
            aria-label={ACTION_LABEL[primary.key]}
            aria-disabled={!primary.av.ok || undefined}
            className={cn("whitespace-nowrap px-3", bar ? "min-w-0 flex-[2]" : "w-full", !primary.av.ok && "opacity-45")}
            onClick={() => fire(primary.key, primary.av)}
          >
            {ACTION_SHORT[primary.key]}
          </Button>
        )}
        <div className={cn("flex gap-2", bar && "contents")}>
          {secondary.map((r) => btn(r.key, r.av, ACTION_SHORT[r.key]))}
        </div>
      </div>
    </div>
  );
}
