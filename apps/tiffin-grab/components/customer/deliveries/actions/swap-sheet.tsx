"use client";
import { ArrowLeftRight, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { applyMyDeliverySwap, loadMySwapOptions, removeMyDeliverySwap } from "@/app/(customer)/me/deliveries/actions";
import { Button, Chip, Notice, Reason, Segmented, Sheet, Skeleton, panelId } from "@/components/customer/kit";
import { cn } from "@/components/customer/kit/cn";
import { actionAvailability, formatCutoff, humanDate } from "@/lib/deliveries-view";
import type { SwapOption } from "@/lib/menu/meal-validation";
import { labelAppliedSwaps } from "@/lib/menu/swap-rules";
import type { ResolvedCategory } from "@/lib/menu/resolve-delivery-meal";
import type { ActionSheetProps } from "./types";

const PREFIX = "swap";
const shortDay = (iso: string) => humanDate(iso).replace(",", "");
const pairKey = (from: string, to: string) => `${from}>${to}`;
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

/** Steps through backend `validBundles` by index — never invents intermediate quantities. */
function BundleStepper({
  option,
  index,
  onChange,
  disabled,
}: {
  option: SwapOption;
  index: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const bundles = option.validBundles;
  const bundle = bundles[index];
  if (!bundle) return null;
  const label = option.fromCategory;
  const atMin = index <= 0;
  const atMax = index >= bundles.length - 1;
  const btn = cn(FOCUS, "grid size-11 place-items-center rounded-full aria-disabled:opacity-35 active:bg-[var(--muted)]");
  return (
    <div className="inline-flex items-center rounded-full border-[1.5px] border-[var(--border)] bg-[var(--card)]">
      <button
        type="button"
        className={btn}
        aria-label={`Decrease ${label}`}
        aria-disabled={atMin || disabled || undefined}
        disabled={atMin || disabled}
        onClick={() => !atMin && onChange(index - 1)}
      >
        <Minus aria-hidden className="size-4" />
      </button>
      <span aria-live="polite" className="min-w-14 px-1 text-center text-sm font-semibold tabular-nums">
        {bundle.giveNatural ?? `${bundle.fromPicks}`}
      </span>
      <button
        type="button"
        className={btn}
        aria-label={`Increase ${label}`}
        aria-disabled={atMax || disabled || undefined}
        disabled={atMax || disabled}
        onClick={() => !atMax && onChange(index + 1)}
      >
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  );
}

function MealSummary({ meal, portions }: { meal: ResolvedCategory[] | null | undefined; portions: Record<string, string> }) {
  if (!meal?.length) return null;
  return (
    <section aria-label="Your meal" className="flex flex-col gap-2 rounded-3xl border-[1.5px] border-[var(--border)] bg-[var(--muted)]/40 p-3">
      <h3 className="text-sm font-semibold">Your meal</h3>
      <ul className="flex flex-col gap-2">
        {meal.map((cat) => (
          <li key={cat.category}>
            <p className="text-[13px] font-semibold text-[var(--muted-foreground,#6E6558)]">{cat.label}</p>
            <ul className="mt-0.5 list-disc pl-4 text-[15px]">
              {!cat.selectable && portions[cat.category]
                ? <li>{portions[cat.category]}</li>
                : cat.picks.length > 0
                  ? cat.picks.map((p) => <li key={`${cat.category}-${p.dishPublicId}-${p.name}`}>{p.name}</li>)
                  : <li>{portions[cat.category] ?? cat.label}</li>}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SwapSheet({ trip, plan, open, day: startDay, onDone, onChanged }: ActionSheetProps) {
  const days = trip.coversDates.length ? trip.coversDates : [trip.date];
  const [day, setDay] = useState(startDay && days.includes(startDay) ? startDay : days[0]);
  const [pair, setPair] = useState<string | null>(null);
  const [bundleIdx, setBundleIdx] = useState(0);
  const [pending, setPending] = useState<"apply" | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<SwapOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [now] = useState(() => Date.now());

  const av = actionAvailability(trip, now, plan.ctx).swap;
  const closed = now >= trip.cutoffAt;
  const lockReason = !av.ok ? av.why : closed ? `Changes closed ${formatCutoff(trip.cutoffAt, plan.ctx.timezone)}. This trip is being prepared.` : null;

  const source = plan.days.find((d) => d.date === trip.date);
  const eating = source?.eatingDays?.find((e) => e.date === day);
  const label = (k: string) => plan.categoryLabels[k] ?? k;
  const applied = eating?.appliedSwaps ?? [];
  const cats = plan.swapCategories;
  const lockLine = trip.eatingDays.find((e) => e.date === day)?.locksWith;
  const dayMeal: ResolvedCategory[] | null | undefined =
    day === trip.date ? source?.meal : (source?.carriedMeals?.[day] ?? source?.meal);

  const reloadOptions = useCallback(() => {
    setLoadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!open || lockReason || !trip.deliveryId) return;
    let live = true;
    loadMySwapOptions(trip.deliveryId, day)
      .then((r) => {
        if (!live) return;
        if ("error" in r) {
          setOptions(null);
          setLoadError(r.error);
        } else {
          setLoadError(null);
          setOptions(r.options);
        }
      })
      .catch(() => {
        if (!live) return;
        setOptions(null);
        setLoadError("Couldn't load available swaps. Try again.");
      });
    return () => {
      live = false;
    };
  }, [open, lockReason, trip.deliveryId, day, loadKey]);

  const chosen = options?.find((o) => pairKey(o.fromCategory, o.toCategory) === pair) ?? null;
  const bundles = chosen?.validBundles ?? [];
  const shownIdx = bundles.length ? Math.min(bundleIdx, bundles.length - 1) : 0;
  const bundle = bundles[shownIdx] ?? null;

  const run = async (key: string, call: () => Promise<{ ok: true } | { error: string }>, msg: string) => {
    if (pending || !trip.deliveryId) return;
    setPending(key);
    setError(null);
    try {
      const r = await call();
      if ("error" in r) {
        setError(r.error);
        reloadOptions();
      } else {
        setPair(null);
        setBundleIdx(0);
        setOptions(null);
        reloadOptions();
        if (onChanged) onChanged(msg);
        else onDone(msg);
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
      reloadOptions();
    } finally {
      setPending(null);
    }
  };

  const onApply = () => {
    if (!chosen || !bundle) return;
    return run(
      "apply",
      () => applyMyDeliverySwap(trip.deliveryId!, chosen.fromCategory, chosen.toCategory, bundle.fromPicks, day),
      `Swap applied to ${humanDate(day)}.`,
    );
  };

  const selectPair = (key: string) => {
    setPair(key);
    setBundleIdx(0);
    setError(null);
  };

  const canApply = !!chosen && !!bundle && !lockReason && !pending;
  const showApplyFooter = !lockReason && options !== null && options.length > 0;

  return (
    <Sheet
      open={open}
      onClose={() => onDone()}
      title="Swap items"
      footer={
        showApplyFooter ? (
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            pending={pending === "apply"}
            disabled={!canApply}
            onClick={onApply}
          >
            Apply swap
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {days.length > 1 && (
          <Segmented
            label="Eating day"
            idPrefix={PREFIX}
            items={days.map((d) => ({ id: d, label: shortDay(d) }))}
            value={day}
            onChange={(d) => {
              setDay(d);
              setPair(null);
              setBundleIdx(0);
              setError(null);
              setOptions(null);
              setLoadError(null);
            }}
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
                Swaps apply to one eating day. Change them until {formatCutoff(trip.cutoffAt, plan.ctx.timezone)}. Only exchanges that fit your meal are shown.
              </Reason>
              <MealSummary meal={dayMeal} portions={plan.categoryPortions} />
              {applied.length > 0 && (
                <section aria-label="Applied swaps" className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">Applied on this day</h3>
                  {labelAppliedSwaps(applied, label, cats).map((text, i) => {
                    const s = applied[i]!;
                    return (
                      <div key={s.publicId} className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--muted)] py-1 pl-4 pr-1">
                        <Chip tone="swap">{text}</Chip>
                        <Button
                          variant="quiet"
                          pending={pending === s.publicId}
                          disabled={!!pending}
                          aria-label={`Remove swap ${text}`}
                          onClick={() =>
                            run(s.publicId, () => removeMyDeliverySwap(trip.deliveryId!, s.publicId, day), `Swap removed from ${humanDate(day)}.`)
                          }
                        >
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
                {options === null && !loadError && (
                  <div className="flex flex-col gap-2" aria-busy="true" aria-label="Finding available swaps">
                    <p className="text-[13px] text-[var(--muted-foreground,#6E6558)]">Finding available swaps...</p>
                    <Skeleton className="h-16 w-full rounded-3xl" />
                    <Skeleton className="h-16 w-full rounded-3xl" />
                  </div>
                )}
                {loadError && (
                  <Notice tone="error">
                    {loadError}{" "}
                    <button type="button" className="underline" onClick={reloadOptions}>
                      Retry
                    </button>
                  </Notice>
                )}
                {options && options.length === 0 && <Notice>No swaps are available for this meal.</Notice>}
                {options?.map((o) => {
                  const key = pairKey(o.fromCategory, o.toCategory);
                  const on = key === pair;
                  const name = `${label(o.fromCategory)} → ${label(o.toCategory)}`;
                  const preview =
                    o.giveNatural && o.getNatural
                      ? `${o.giveNatural} → ${o.getNatural}`
                      : o.giveNatural ?? "";
                  return (
                    <div
                      key={key}
                      className={cn(
                        "rounded-3xl border-[1.5px] p-3",
                        on ? "border-[var(--primary)] bg-[var(--primary-wash,#FBE3D2)]/40" : "border-[var(--border)] bg-[var(--card)]",
                      )}
                    >
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={name}
                        disabled={!!pending}
                        onClick={() => !pending && selectPair(key)}
                        className="flex min-h-11 w-full items-center gap-3 text-left [touch-action:manipulation] disabled:opacity-50"
                      >
                        <ArrowLeftRight aria-hidden className="size-5 shrink-0 text-[var(--primary)]" />
                        <span className="flex flex-1 flex-col gap-0.5">
                          <span className="text-[15px] font-semibold">{name}</span>
                          {preview && (
                            <span className="text-[13px] text-[var(--muted-foreground,#6E6558)]">{preview}</span>
                          )}
                        </span>
                        <span className="text-[13px] font-medium text-[var(--primary)]">{on ? "Selected" : "Select"}</span>
                      </button>
                      {on && bundle && (
                        <div className="mt-2 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                          <p className="text-sm">
                            Give up <b>{bundle.giveNatural ?? `${bundle.fromPicks} ${label(o.fromCategory)}`}</b>
                            {", get "}
                            <b>+{bundle.getNatural ?? `${bundle.toPicks} ${label(o.toCategory)}`}</b>
                          </p>
                          {bundles.length > 1 && (
                            <BundleStepper
                              option={o}
                              index={shownIdx}
                              onChange={setBundleIdx}
                              disabled={!!pending}
                            />
                          )}
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
  );
}
