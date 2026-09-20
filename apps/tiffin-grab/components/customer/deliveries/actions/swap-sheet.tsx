"use client";
import { ArrowLeftRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { applyMyDeliverySwap, removeMyDeliverySwap } from "@/app/(customer)/me/deliveries/actions";
import { Button, Chip, Notice, Reason, Segmented, Sheet, Stepper, Toast, panelId } from "@/components/customer/kit";
import { cn } from "@/components/customer/kit/cn";
import { actionAvailability, formatCutoff, humanDate } from "@/lib/deliveries-view";
import type { ActionSheetProps } from "./types";

const PREFIX = "swap";
const shortDay = (iso: string) => humanDate(iso).replace(",", "");

export function SwapSheet({ trip, plan, open, onDone }: ActionSheetProps) {
  const router = useRouter();
  const days = trip.coversDates.length ? trip.coversDates : [trip.date];
  const [day, setDay] = useState(days[0]);
  const [pair, setPair] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [pending, setPending] = useState<"apply" | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const av = actionAvailability(trip, Date.now(), plan.ctx).swap;
  const closed = Date.now() >= trip.cutoffAt;
  const lockReason = !av.ok ? av.why : closed ? `Changes closed ${formatCutoff(trip.cutoffAt, plan.ctx.timezone)}. This trip is being prepared.` : null;

  const source = plan.days.find((d) => d.date === trip.date);
  const eating = source?.eatingDays?.find((e) => e.date === day);
  const label = (k: string) => plan.categoryLabels[k] ?? k;
  const pairs = [...new Map((eating?.swapPairs ?? []).map((p) => [`${p.fromCategory}>${p.toCategory}`, p])).values()];
  const applied = eating?.appliedSwaps ?? [];
  const chosen = pairs.find((p) => `${p.fromCategory}>${p.toCategory}` === pair) ?? null;
  // ponytail: ceiling is the base pick count from the trip's own-date meal; the server folds applied swaps and has the last word.
  const have = chosen ? (source?.meal?.find((m) => m.category === chosen.fromCategory)?.quantity ?? 9) : 1;
  const lockLine = trip.eatingDays.find((e) => e.date === day)?.locksWith;

  const finish = (msg: string) => {
    setToast(msg);
    router.refresh();
    onDone();
  };
  const run = async (key: string, call: () => Promise<{ ok: true } | { error: string }>, msg: string) => {
    if (pending || !trip.deliveryId) return;
    setPending(key);
    setError(null);
    try {
      const r = await call();
      if ("error" in r) setError(r.error);
      else finish(msg);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setPending(null);
    }
  };

  const onApply = () => {
    if (!chosen) return;
    return run("apply", () => applyMyDeliverySwap(trip.deliveryId!, chosen.fromCategory, chosen.toCategory, qty, day), `Swap applied to ${humanDate(day)}.`);
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onDone}
        title="Swap items"
        footer={
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            pending={pending === "apply"}
            disabled={!chosen || !!lockReason}
            onClick={onApply}
          >
            Apply swap
          </Button>
        }
      >
        <div className="flex flex-col gap-4 pb-2">
          {days.length > 1 && (
            <Segmented
              label="Eating day"
              idPrefix={PREFIX}
              items={days.map((d) => ({ id: d, label: shortDay(d) }))}
              value={day}
              onChange={(d) => (setDay(d), setPair(null), setQty(1), setError(null))}
            />
          )}
          <div role={days.length > 1 ? "tabpanel" : undefined} id={panelId(PREFIX, day)} className="flex flex-col gap-4">
            <p className="text-[15px] font-semibold">Swap for {humanDate(day)}</p>
            {lockLine && <Reason>Locks with {humanDate(lockLine)}&apos;s delivery.</Reason>}
            {lockReason ? (
              <Notice>{lockReason}</Notice>
            ) : (
              <>
                <Reason>
                  Swaps apply to one eating day. Change them until {formatCutoff(trip.cutoffAt, plan.ctx.timezone)}. Portions must divide evenly, and some items have a per-tiffin limit; we&apos;ll tell you if a swap goes over.
                </Reason>
                {trip.eatingDays.find((e) => e.date === day)?.dishSummary && (
                  <p className="text-[13px] text-[var(--muted-foreground,#6E6558)]">Now: {trip.eatingDays.find((e) => e.date === day)!.dishSummary}</p>
                )}
                {applied.length > 0 && (
                  <section aria-label="Applied swaps" className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold">Applied on this day</h3>
                    {applied.map((s) => {
                      const text = `${s.qtyFrom} ${label(s.fromCategory)} → ${s.qtyTo} ${label(s.toCategory)}`;
                      return (
                        <div key={s.publicId} className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--muted)] py-1 pl-4 pr-1">
                          <Chip tone="swap">{text}</Chip>
                          <Button variant="quiet" pending={pending === s.publicId} aria-label={`Remove swap ${text}`} onClick={() => run(s.publicId, () => removeMyDeliverySwap(trip.deliveryId!, s.publicId, day), `Swap removed from ${humanDate(day)}.`)}>
                            <X aria-hidden className="size-4" />
                            Remove
                          </Button>
                        </div>
                      );
                    })}
                  </section>
                )}
                <section aria-label="Available swaps" className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">Swap options</h3>
                  {pairs.length === 0 && <Notice>No swaps are available for your {plan.sub.mealSizeName} plan.</Notice>}
                  {pairs.map((p) => {
                    const key = `${p.fromCategory}>${p.toCategory}`;
                    const on = key === pair;
                    const name = `${label(p.fromCategory)} → ${label(p.toCategory)}`;
                    return (
                      <div key={key} className={cn("rounded-3xl border-[1.5px] p-3", on ? "border-[var(--primary)] bg-[var(--primary-wash,#FBE3D2)]/40" : "border-[var(--border)] bg-[var(--card)]")}>
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={name}
                          onClick={() => (setPair(key), setQty(1), setError(null))}
                          className="flex min-h-11 w-full items-center gap-3 text-left [touch-action:manipulation]"
                        >
                          <ArrowLeftRight aria-hidden className="size-5 shrink-0 text-[var(--primary)]" />
                          <span className="flex-1 text-[15px] font-semibold">{name}</span>
                          <span className="text-[13px] text-[var(--muted-foreground,#6E6558)]">
                            {[plan.categoryPortions[p.fromCategory], plan.categoryPortions[p.toCategory]].filter(Boolean).join(" / ")}
                          </span>
                        </button>
                        {on && (
                          <div className="mt-2 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                            <p className="text-sm">
                              Give up <b>{qty}</b> {label(p.fromCategory)} for {label(p.toCategory)}. We match the portion size for you.
                            </p>
                            <Stepper label={`${label(p.fromCategory)} to give up`} value={qty} min={1} max={Math.max(1, have)} onChange={setQty} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>
              </>
            )}
            {error && <Notice tone="error">{error}</Notice>}
          </div>
        </div>
      </Sheet>
      <Toast open={toast !== null} onClose={() => setToast(null)}>
        {toast}
      </Toast>
    </>
  );
}
