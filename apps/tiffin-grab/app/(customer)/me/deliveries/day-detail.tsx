"use client";

// The body of "tap a day = meal selection for that day": shared by the desktop persistent panel
// and the mobile inline stack under the month grid. Locked days are viewable but not editable
// (CutoffBanner only); an unlocked "cell" day with a released menu shows its currently-picked
// meal FIRST (via MobileDayOrderCard on mobile), then the interactive MealDayPicker below to
// change that pick — there's no separate "Pick your meals" button. Per-day Skip/Change-address
// controls sit below that. Never renders pause/resume — that's PauseControl (dialog desktop /
// drawer mobile), decoupled from day-click on purpose.
//
// A date can land in one of three "kinds", not just cell-present/absent, because absent has two
// distinct causes that read very differently to a customer:
//   - "cell":       myCalendar resolved a cell for this date — the normal case. The week's menu
//                    may still be unreleased even here (cell.options empty) — see `released` below.
//   - "unreleased": a delivery row exists (myDeliveries) but its week isn't released yet, so
//                    myCalendar omitted the cell — "menu not published", never "Locked/Sealed".
//   - "off":        no delivery row AND no cell — the day simply isn't in the plan's delivery
//                    pattern (e.g. a weekend). Inert, never "Locked/Sealed" either.
// Only "cell" kind status is ever fed through calendarDayStatus; "unreleased"/"off" are handled
// as their own branches so the "locked" visual is never applied to a day that was never sealed.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PencilIcon, CalendarClockIcon, CalendarPlusIcon } from "lucide-react";
import { deliveryAddressSchema, weekdayKey, type DeliveryAddressValues } from "@realm/commons";
import { cn } from "@realm/ui/cn";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { AddressDisplay } from "@realm/ui/address-display";
import { AddressFields } from "@realm/ui/address-fields";
import { ResponsiveDialog } from "@/components/ds";
import { formatDateOnly, formatEpoch } from "@/lib/format/datetime";
import { CutoffBanner } from "@/components/customer/meals/cutoff-banner";
import type { CalendarCell } from "./calendar-constants";
import { DAY_STATUS_BAR_CLASS, DAY_STATUS_LABEL, calendarDayStatus, type DayStatus } from "./day-status";
import { menuNotPublishedCopy, menuNotReleasedCopy } from "./day-summary-message";
import { mealChips } from "./meal-chips";
import { MealDayPicker } from "./meal-day-picker";
import type { CustomerDelivery, TiffinCounts } from "@/lib/services/customer-deliveries.service";
import type { DeliveryCardMeal } from "./meal-chips";
import {
  applyMyDeliverySwap,
  clearMyDeliveryAddress,
  removeMyDeliverySwap,
  rescheduleMyDelivery,
  scheduleMyPooledTiffin,
  setMyDeliveryAddress,
  skipMyDelivery,
  unskipMyDelivery,
} from "./actions";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@realm/ui/select";
import { VacationDateField } from "./vacation-date-field";
import { isPoolScheduleDateEligible, isRescheduleTargetDateEligible } from "./pool-date-eligibility";

type Address = DeliveryAddressValues;
type SwapPair = { fromCategory: string; toCategory: string };
type AppliedSwap = { publicId: string; fromCategory: string; toCategory: string; qtyFrom: number; qtyTo: number };
type DeliveryCardData = CustomerDelivery & {
  meal: DeliveryCardMeal;
  address: Address;
  hasAddressOverride: boolean;
  hasMakeupScheduled: boolean;
  swapPairs: SwapPair[];
  mealSizeCategories: string[];
  appliedSwaps: AppliedSwap[];
};
type HoldDeliveryOption = {
  publicId: string;
  deliveryDate: string;
  status: "skipped" | "paused";
};

export function holdDeliveriesFrom(deliveries: DeliveryCardData[]): HoldDeliveryOption[] {
  return deliveries
    .filter(
      (d) =>
        !d.isMakeup &&
        (d.status === "skipped" || d.status === "paused") &&
        !d.hasMakeupScheduled &&
        d.pooledAt == null,
    )
    .map((d) => ({
      publicId: d.publicId,
      deliveryDate: d.deliveryDate,
      status: d.status as "skipped" | "paused",
    }))
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
}

function isRescheduleTargetOccupied(delivery: DeliveryCardData | undefined): boolean {
  if (!delivery) return false;
  if (delivery.isMakeup) return true;
  return delivery.status === "scheduled";
}

function ChangeAddressDialog({ deliveryPublicId, address, onSaved }: {
  deliveryPublicId: string;
  address: Address;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [values, setValues] = useState<DeliveryAddressValues>(address);
  const [errors, setErrors] = useState<Partial<Record<keyof DeliveryAddressValues, string>>>({});

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setValues(address);
      setErrors({});
    }
  }

  function save() {
    const parsed = deliveryAddressSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<keyof DeliveryAddressValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !(key in next)) {
          next[key as keyof DeliveryAddressValues] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    start(async () => {
      try {
        await setMyDeliveryAddress(deliveryPublicId, parsed.data);
        setOpen(false);
        onSaved();
        toast.success("Address updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update address");
      }
    });
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button variant="outline" size="sm">
          <PencilIcon data-icon="inline-start" /> Change address
        </Button>
      }
      title="Change delivery address"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      }
    >
      <div className="space-y-4 px-4 pb-4 sm:px-0 sm:pb-0">
        <p className="text-muted-foreground text-sm">
          Current: <AddressDisplay address={address} className="text-foreground" />
        </p>
        <AddressFields
          preset="delivery"
          idPrefix={`delivery-${deliveryPublicId}`}
          values={values}
          errors={errors}
          onChange={(patch) => {
            setValues((prev) => ({ ...prev, ...patch }));
            setErrors((prev) => {
              const next = { ...prev };
              for (const key of Object.keys(patch) as (keyof DeliveryAddressValues)[]) {
                delete next[key];
              }
              return next;
            });
          }}
        />
      </div>
    </ResponsiveDialog>
  );
}

function RescheduleDialog({
  deliveryPublicId,
  today,
  sourceDateIso,
  onSaved,
}: {
  deliveryPublicId: string;
  today: string;
  sourceDateIso?: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDate("");
    setError(null);
  }

  function submit() {
    if (!date) return;
    setError(null);
    start(async () => {
      try {
        await rescheduleMyDelivery(deliveryPublicId, date);
        setOpen(false);
        reset();
        onSaved();
        toast.success("Delivery rescheduled");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not reschedule");
      }
    });
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
      trigger={
        <Button variant="outline" size="sm">
          <CalendarClockIcon data-icon="inline-start" /> Reschedule
        </Button>
      }
      title="Reschedule delivery"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!date || pending} onClick={submit}>{pending ? "Saving…" : "Confirm"}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {sourceDateIso
            ? `Move your ${formatDateOnly(sourceDateIso, { mode: "short" })} hold day to another delivery day, or tap a date on the calendar and use “Reschedule hold day here”.`
            : "Pick the day you want this delivery moved to. Your original day will be skipped and a new delivery will be added on the date you choose."}
        </p>
        <VacationDateField
          id={`reschedule-${deliveryPublicId}`}
          label="New delivery day"
          value={date}
          onChange={setDate}
          today={today}
          minDate={today}
        />
        {error && <p className="text-bad text-xs">{error}</p>}
      </div>
    </ResponsiveDialog>
  );
}

function ScheduleHoldDayAction({
  holdDeliveries,
  dateIso,
  counts,
  today,
  targetOccupied,
  onChanged,
}: {
  holdDeliveries: HoldDeliveryOption[];
  dateIso: string;
  counts: TiffinCounts;
  today: string;
  targetOccupied: boolean;
  onChanged: () => void;
}) {
  const movable = holdDeliveries.filter((h) => h.deliveryDate !== dateIso);
  const [open, setOpen] = useState(false);
  const [holdPublicId, setHoldPublicId] = useState(movable[0]?.publicId ?? "");
  const [pending, start] = useTransition();

  if (movable.length === 0 || targetOccupied) return null;
  if (!isRescheduleTargetDateEligible(dateIso, counts, today)) return null;

  function run(publicId: string) {
    start(async () => {
      try {
        await rescheduleMyDelivery(publicId, dateIso);
        setOpen(false);
        onChanged();
        toast.success("Hold day rescheduled");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not reschedule that day");
      }
    });
  }

  if (movable.length === 1) {
    const hold = movable[0]!;
    return (
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(hold.publicId)}>
        <CalendarClockIcon data-icon="inline-start" />
        Reschedule hold day here
      </Button>
    );
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline" size="sm">
          <CalendarClockIcon data-icon="inline-start" />
          Reschedule hold day here
        </Button>
      }
      title="Reschedule a hold day"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!holdPublicId || pending} onClick={() => run(holdPublicId)}>
            {pending ? "Saving…" : "Confirm"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Move a hold day to {formatDateOnly(dateIso, { mode: "long" })}.
        </p>
        <div className="space-y-2">
          <label htmlFor="hold-day-pick" className="text-sm font-medium">Hold day to move</label>
          <Select value={holdPublicId} onValueChange={setHoldPublicId}>
            <SelectTrigger id="hold-day-pick" className="w-full">
              <SelectValue placeholder="Choose a hold day" />
            </SelectTrigger>
            <SelectContent>
              {movable.map((h) => (
                <SelectItem key={h.publicId} value={h.publicId}>
                  {formatDateOnly(h.deliveryDate, { mode: "short" })}
                  {h.status === "paused" ? " (paused)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function SchedulePoolDayAction({
  orderPublicId,
  dateIso,
  counts,
  today,
  onChanged,
}: {
  orderPublicId: string;
  dateIso: string;
  counts: TiffinCounts;
  today: string;
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();

  if (!isPoolScheduleDateEligible(dateIso, counts, today)) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        start(async () => {
          try {
            await scheduleMyPooledTiffin(orderPublicId, dateIso);
            onChanged();
            toast.success("Skipped tiffin scheduled");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not schedule that day");
          }
        });
      }}
    >
      <CalendarPlusIcon data-icon="inline-start" />
      Schedule skipped tiffin here
    </Button>
  );
}

// Applying/removing a swap for one specific day. No dialog — unlike address
// (multi-field input), applying/removing a swap is a single control + single
// server-action call, closer to the skip/un-skip bare-button pattern than
// ChangeAddressDialog. Eligibility is global (category_swap_pairs) now, so
// there's no per-meal-size rule list to render as buttons — just a from/to
// category picker constrained to this meal size's eligible pairs.
function SwapSection({
  delivery,
  categoryLabels,
  onChanged,
}: {
  delivery: DeliveryCardData;
  categoryLabels: Record<string, string>;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const label = (key: string) => categoryLabels[key] ?? key;

  function run(fn: () => Promise<void>, successMsg: string) {
    startTransition(async () => {
      try {
        await fn();
        onChanged();
        toast.success(successMsg);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Swap failed");
      }
    });
  }

  if (delivery.swapPairs.length === 0) return null;

  return (
    <OpenSwapPicker
      deliveryPublicId={delivery.publicId}
      swapPairs={delivery.swapPairs}
      appliedSwaps={delivery.appliedSwaps}
      label={label}
      pending={pending}
      run={run}
    />
  );
}

// From/to category picker constrained to this meal size's globally-eligible
// swap pairs. Applied swaps render as removable chips.
function OpenSwapPicker({
  deliveryPublicId,
  swapPairs,
  appliedSwaps,
  label,
  pending,
  run,
}: {
  deliveryPublicId: string;
  swapPairs: SwapPair[];
  appliedSwaps: AppliedSwap[];
  label: (key: string) => string;
  pending: boolean;
  run: (fn: () => Promise<void>, successMsg: string) => void;
}) {
  const fromOptions = [...new Set(swapPairs.map((p) => p.fromCategory))];
  const [from, setFrom] = useState<string>(fromOptions[0]);
  const toOptions = swapPairs.filter((p) => p.fromCategory === from).map((p) => p.toCategory);
  const [to, setTo] = useState<string>(toOptions[0]);
  const [picks, setPicks] = useState("1");

  function selectFrom(next: string) {
    setFrom(next);
    const firstTo = swapPairs.find((p) => p.fromCategory === next)?.toCategory;
    if (firstTo) setTo(firstTo);
  }

  const picksNum = Number(picks);
  const validPicks = Number.isInteger(picksNum) && picksNum > 0;

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs font-medium">Swap items for this day</p>
      {appliedSwaps.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {appliedSwaps.map((s) => (
            <span key={s.publicId} className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
              {s.qtyFrom} {label(s.fromCategory)} → {s.qtyTo} {label(s.toCategory)}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs underline"
                disabled={pending}
                onClick={() => run(() => removeMyDeliverySwap(deliveryPublicId, s.publicId), "Swap removed")}
              >
                Remove
              </Button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-14 tabular-nums"
          type="number"
          min={1}
          value={picks}
          onChange={(e) => setPicks(e.target.value)}
        />
        <Select value={from} onValueChange={selectFrom}>
          <SelectTrigger className="w-36" size="sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {fromOptions.map((c) => <SelectItem key={c} value={c}>{label(c)}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs">for</span>
        <Select value={to} onValueChange={setTo}>
          <SelectTrigger className="w-36" size="sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {toOptions.map((c) => <SelectItem key={c} value={c}>{label(c)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !to || !validPicks}
          onClick={() => run(() => applyMyDeliverySwap(deliveryPublicId, from, to, picksNum), "Swap applied")}
        >
          Swap
        </Button>
      </div>
    </div>
  );
}

// Skip/Un-skip toggle + Change-address, scoped to a pre-cutoff, non-make-up SCHEDULED (or
// SKIPPED, for un-skip) day. Recovered from the pre-redesign delivery-calendar.tsx's
// DeliveryCard actions row — this is the same server-action wiring, just relocated into the
// per-day drawer/panel instead of a per-delivery list card.
function DeliveryDayActions({
  delivery,
  locked,
  today,
  categoryLabels,
  onChanged,
}: {
  delivery: DeliveryCardData;
  locked: boolean;
  today: string;
  categoryLabels: Record<string, string>;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<void>, successMsg: string) {
    startTransition(async () => {
      try {
        await fn();
        onChanged();
        toast.success(successMsg);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed");
      }
    });
  }

  if (locked) {
    const isHoldOriginal =
      !delivery.isMakeup &&
      (delivery.status === "skipped" || delivery.status === "paused") &&
      delivery.pooledAt == null &&
      !delivery.hasMakeupScheduled;
    if (!isHoldOriginal) return null;
  }

  const isHoldOriginal =
    !delivery.isMakeup &&
    (delivery.status === "skipped" || delivery.status === "paused") &&
    delivery.pooledAt == null &&
    !delivery.hasMakeupScheduled;

  const showSkip = !delivery.isMakeup && delivery.status === "scheduled" && !locked;
  const showReschedule =
    (!delivery.isMakeup && delivery.status === "scheduled" && !locked) || isHoldOriginal;
  const showUnskip =
    !locked &&
    !delivery.isMakeup &&
    delivery.status === "skipped" &&
    delivery.pooledAt == null &&
    !delivery.hasMakeupScheduled;
  const showAddress = !locked && delivery.status === "scheduled";
  const showSwap = !locked && delivery.status === "scheduled";

  if (!showSkip && !showReschedule && !showUnskip && !showAddress && !showSwap) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
      {showAddress && (
        <ChangeAddressDialog
          deliveryPublicId={delivery.publicId}
          address={delivery.address}
          onSaved={onChanged}
        />
      )}
      {showAddress && delivery.hasAddressOverride && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => clearMyDeliveryAddress(delivery.publicId), "Address reset to default")}
        >
          Use default
        </Button>
      )}
      {showReschedule && (
        <RescheduleDialog
          deliveryPublicId={delivery.publicId}
          today={today}
          sourceDateIso={isHoldOriginal ? delivery.deliveryDate : undefined}
          onSaved={onChanged}
        />
      )}
      {showSkip && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run(() => skipMyDelivery(delivery.publicId), "Delivery skipped")}
        >
          Skip this day
        </Button>
      )}
      {showUnskip && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run(() => unskipMyDelivery(delivery.publicId), "Delivery restored")}
        >
          Un-skip
        </Button>
      )}
      {!showUnskip && delivery.status === "skipped" && (delivery.pooledAt != null || delivery.hasMakeupScheduled) && (
        <p className="text-muted-foreground text-xs">
          {delivery.hasMakeupScheduled
            ? "This skip was rescheduled — un-skip is not available."
            : "This skip is in your remain pool — schedule it on a delivery day."}
        </p>
      )}
      </div>
      {showSwap && <SwapSection delivery={delivery} categoryLabels={categoryLabels} onChanged={onChanged} />}
    </div>
  );
}

export function DayDetail({
  dateIso,
  cell,
  delivery,
  orderPublicId,
  categoryLabels,
  categoryCounts = {},
  tz,
  today,
  tiffinCounts,
  holdDeliveries = [],
  onChanged,
  variant = "full",
}: {
  dateIso: string;
  cell: CalendarCell | undefined;
  delivery: DeliveryCardData | undefined;
  orderPublicId: string;
  categoryLabels: Record<string, string>;
  categoryCounts?: Record<string, number>;
  tz: string;
  today: string;
  tiffinCounts?: TiffinCounts;
  holdDeliveries?: HoldDeliveryOption[];
  onChanged: () => void;
  variant?: "full" | "picker";
}) {
  const kind: "cell" | "unreleased" | "off" = cell ? "cell" : delivery ? "unreleased" : "off";
  const status: DayStatus = cell ? calendarDayStatus(cell) : "off";
  const chips = delivery ? mealChips(delivery.meal) : [];
  // A "cell" kind day can still have its menu unreleased: myCalendar resolves a cell for the day
  // (it's in the plan's delivery pattern) but the week's menu itself hasn't gone out yet, so
  // options is empty. Distinct from kind === "unreleased" (no cell at all) — same underlying
  // cause, but a different customer-facing moment, so it gets its own copy and never attempts
  // MealDayPicker (which would otherwise silently render nothing via its own options.length guard).
  const released = kind === "cell" && !!cell?.menuWeekId && (cell?.options.length ?? 0) > 0;
  const menuNotReleased = kind === "cell" && status !== "locked" && !released;
  const showSummary = variant === "full";

  return (
    <div className="space-y-3">
      {showSummary && (
        <div
          className={cn(
            "relative rounded-lg border bg-card py-2 pr-3 pl-6 text-sm",
            "after:absolute after:inset-y-2 after:left-2 after:w-1 after:rounded-full",
            kind === "unreleased" ? "after:bg-muted-foreground/30" : DAY_STATUS_BAR_CLASS[status],
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">{formatDateOnly(dateIso, { mode: "weekday" })}</p>
            {/* No status pill for "unreleased" — its body copy ("Menu not published yet") already
                says everything; a "Locked"/"Sealed" pill next to it would be contradictory. */}
            {kind !== "unreleased" && <span className="text-muted-foreground text-xs">{DAY_STATUS_LABEL[status]}</span>}
          </div>
          {kind === "unreleased" && <p className="mt-1 text-muted-foreground text-xs">{menuNotPublishedCopy(dateIso)}</p>}
          {kind === "cell" && menuNotReleased && <p className="mt-1 text-muted-foreground text-xs">{menuNotReleasedCopy(dateIso)}</p>}
          {kind === "cell" && !menuNotReleased && delivery && (
            chips.length === 0 ? (
              <p className="mt-1 text-muted-foreground text-xs">Nothing scheduled</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {chips.map((c, i) => (
                  <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs">{c}</span>
                ))}
              </div>
            )
          )}
          {kind === "off" && <p className="mt-1 text-muted-foreground text-xs">Not scheduled this day.</p>}
          {status === "locked" && delivery && (
            <p className="mt-1 text-muted-foreground text-xs">
              Cutoff passed {formatEpoch(delivery.cutoffAt, { mode: "datetime", timeZone: tz })}
            </p>
          )}
        </div>
      )}

      {status === "locked" ? (
        delivery ? (
          <CutoffBanner
            days={[{ dateIso, dayOfWeek: weekdayKey(new Date(`${dateIso}T00:00:00Z`)), lockMs: delivery.cutoffAt }]}
            lockedLabel="This day's meal is locked."
          />
        ) : null
      ) : kind === "cell" && cell && released ? (
        <MealDayPicker
          cell={cell}
          orderPublicId={orderPublicId}
          categoryLabels={categoryLabels}
          categoryCounts={categoryCounts}
          onChanged={onChanged}
        />
      ) : null}

      {kind === "cell" && delivery && (
        <DeliveryDayActions
          delivery={delivery}
          locked={status === "locked"}
          today={today}
          categoryLabels={categoryLabels}
          onChanged={onChanged}
        />
      )}

      {kind === "off" && tiffinCounts && tiffinCounts.pooled > 0 && (
        <SchedulePoolDayAction
          orderPublicId={orderPublicId}
          dateIso={dateIso}
          counts={tiffinCounts}
          today={today}
          onChanged={onChanged}
        />
      )}

      {tiffinCounts && holdDeliveries.length > 0 && (
        <ScheduleHoldDayAction
          holdDeliveries={holdDeliveries}
          dateIso={dateIso}
          counts={tiffinCounts}
          today={today}
          targetOccupied={isRescheduleTargetOccupied(delivery)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}
