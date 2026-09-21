"use client";

// The body of "tap a day = meal selection for that day": shared by the desktop persistent panel
// and the mobile inline stack under the month grid. Locked days are viewable but not editable
// (CutoffBanner only); an unlocked "cell" day with a released menu shows its currently-picked
// meal FIRST (via MobileDayOrderCard on mobile), then the interactive MealDayPicker below to
// change that pick — there's no separate "Pick your meals" button. Plan vacation plus per-day
// Reschedule/Address/Swap sit in a 2-column tile grid below that. There is no Skip tile —
// moving a tiffin is Reschedule. Vacation is plan-level (pause range) but lives with the
// other delivery buttons so the page is one action cluster.
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

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowLeftRightIcon,
  CalendarClockIcon,
  CalendarPlusIcon,
  HomeIcon,
  MapPinIcon,
  Undo2Icon,
} from "lucide-react";
import { deliveryAddressSchema, weekdayKey, type DeliveryAddressValues } from "@foundry/commons";
import { cn } from "@foundry/ui/cn";
import { Button } from "@foundry/ui/button";
import { DialogFooterRow, IOS_BUTTON } from "@/components/customer/ios-button";
import { Input } from "@foundry/ui/input";
import { AddressDisplay } from "@foundry/ui/address-display";
import { AddressFields } from "@/components/customer/address/address-fields";
import { ResponsiveDialog } from "@/components/ds";
import { fullDayName } from "@/lib/menu/coverage";
import { formatDateOnly, formatEpoch } from "@/lib/format/datetime";
import { CutoffBanner } from "@/components/customer/meals/cutoff-banner";
import type { CalendarCell } from "./calendar-constants";
import { DAY_STATUS_BAR_CLASS, calendarDayStatus, calendarLegendLabel, type DayStatus } from "./day-status";
import { menuNotPublishedCopy, menuNotReleasedCopy } from "./day-summary-message";
import { mealChips } from "./meal-chips";
import { MealDayPicker } from "./meal-day-picker";
import { applySwapsToCounts } from "@/lib/menu/swap-rules";
import type { ActionResult } from "../action-result";
import type { CustomerDelivery, TiffinCounts } from "@/lib/services/customer-deliveries.service";
import type { DeliveryCardMeal } from "./meal-chips";
import {
  applyMyDeliverySwap,
  clearMyDeliveryAddress,
  removeMyDeliverySwap,
  rescheduleMyDelivery,
  scheduleMyPooledTiffin,
  setMyDeliveryAddress,
  unskipMyDelivery,
} from "./actions";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@foundry/ui/select";
import { VacationDateField } from "./vacation-date-field";
import { isPoolScheduleDateEligible, isRescheduleTargetDateEligible } from "./pool-date-eligibility";
import { ActionCard, ActionGrid, DELIVERY_SHEET_DIRECTION } from "./action-card";
import {
  formatEatDayCarryPreview,
  previewEatDayCarry,
} from "@/lib/menu/carry-trip";
import type { DayOfWeek } from "@/lib/menu/delivery-days";

type Address = DeliveryAddressValues;
type SwapPair = { fromCategory: string; toCategory: string };
type AppliedSwap = { publicId: string; fromCategory: string; toCategory: string; qtyFrom: number; qtyTo: number; forDate?: string | null };
type DeliveryCardData = CustomerDelivery & {
  meal: DeliveryCardMeal;
  address: Address;
  hasAddressOverride: boolean;
  hasMakeupScheduled: boolean;
  swapPairs: SwapPair[];
  mealSizeCategories: string[];
  appliedSwaps: AppliedSwap[];
  eatingDays?: import("@/lib/services/trip-eating-days.service").TripEatingDay[];
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

// Eat-day reschedule: picker is the day the customer wants to eat. Weekends and
// off-pattern days snap to the carrying trip (server + shared preview helper).
function RescheduleDialog({
  deliveryPublicId,
  today,
  sourceDateIso,
  deliveryWeekdays,
  onSaved,
}: {
  deliveryPublicId: string;
  today: string;
  sourceDateIso?: string;
  deliveryWeekdays: DayOfWeek[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const preview = date && deliveryWeekdays.length
    ? previewEatDayCarry(date, deliveryWeekdays)
    : null;

  function reset() {
    setDate("");
    setError(null);
  }

  function submit() {
    if (!date) return;
    setError(null);
    start(async () => {
      const result = await rescheduleMyDelivery(deliveryPublicId, date);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
      onSaved();
      const carried = "carriedOn" in result ? result.carriedOn : null;
      toast.success(
        carried && carried !== date
          ? `Food for ${date} will arrive with your ${carried} delivery`
          : "Delivery rescheduled",
      );
    });
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
      direction={DELIVERY_SHEET_DIRECTION}
      trigger={
        <ActionCard
          layout="tile"
          icon={CalendarClockIcon}
          title="Reschedule"
          description={
            sourceDateIso
              ? "Move this hold day"
              : "Pick the day you want to eat"
          }
        />
      }
      title="Reschedule — day you want to eat"
      footer={
        <DialogFooterRow>
          <Button variant="secondary" className={IOS_BUTTON} disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button className={IOS_BUTTON} disabled={!date || pending} onClick={submit}>{pending ? "Saving…" : "Confirm"}</Button>
        </DialogFooterRow>
      }
    >
      <div className="space-y-4 px-4 pb-4">
        <p className="text-muted-foreground text-sm">
          {sourceDateIso
            ? `Move your ${formatDateOnly(sourceDateIso, { mode: "short" })} hold. Pick the day you want to eat — weekends and off-pattern days ship with the nearest earlier delivery.`
            : "Pick the day you want to eat. We deliver on your plan’s delivery days only — Tue food rides Monday, weekends ride Friday."}
        </p>
        <VacationDateField
          id={`reschedule-${deliveryPublicId}`}
          label="Day you want to eat"
          value={date}
          onChange={setDate}
          today={today}
          minDate={today}
        />
        {preview ? (
          <div className="bg-muted/50 text-foreground space-y-1 rounded-xl border px-3 py-2 text-sm" aria-live="polite">
            <p>{formatEatDayCarryPreview(preview)}</p>
            {/*
              TODO(you): show the carrying trip's cutoff under the preview.
              Spec: "Show the cutoff of the carrying trip."
              Hint: preview.carriedOn + app cutoffHour + timezone → cutoffMsFor from @foundry/commons,
              then formatEpoch. Trade-off: fetch cutoffHour once (settings) vs hard-code a default.
            */}
          </div>
        ) : null}
        {error && <p className="text-bad text-xs">{error}</p>}
      </div>
    </ResponsiveDialog>
  );
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
      const result = await setMyDeliveryAddress(deliveryPublicId, parsed.data);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      onSaved();
      toast.success("Address updated");
    });
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={handleOpenChange}
      direction={DELIVERY_SHEET_DIRECTION}
      trigger={
        <ActionCard
          layout="tile"
          icon={MapPinIcon}
          title="Address"
          aria-label="Change address"
          description="Deliver somewhere else"
        />
      }
      title="Change delivery address"
      footer={
        <DialogFooterRow>
          <Button variant="secondary" className={IOS_BUTTON} disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button className={IOS_BUTTON} disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooterRow>
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
          // `deliveries` has no lat/lng column (Task 2 didn't touch this table),
          // so a resolved pick only autofills the structured text fields here —
          // there is nowhere yet to persist the coordinates themselves. No
          // onResolve needed: autocomplete is gated on resolveUrl alone.
          resolveUrl="/api/address/resolve"
        />
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
      const result = await rescheduleMyDelivery(publicId, dateIso);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      onChanged();
      toast.success("Hold day rescheduled");
    });
  }

  if (movable.length === 1) {
    const hold = movable[0]!;
    return (
      <ActionCard
        icon={CalendarClockIcon}
        title="Reschedule hold day here"
        description="Use a hold-day tiffin on this date"
        pending={pending}
        onClick={() => run(hold.publicId)}
      />
    );
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      direction={DELIVERY_SHEET_DIRECTION}
      trigger={
        <ActionCard
          icon={CalendarClockIcon}
          title="Reschedule hold day here"
          description="Use a hold-day tiffin on this date"
        />
      }
      title="Reschedule a hold day"
      footer={
        <DialogFooterRow>
          <Button variant="secondary" className={IOS_BUTTON} disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button className={IOS_BUTTON} disabled={!holdPublicId || pending} onClick={() => run(holdPublicId)}>
            {pending ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooterRow>
      }
    >
      <div className="space-y-4 px-4 pb-4">
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
    <ActionCard
      icon={CalendarPlusIcon}
      title="Schedule skipped tiffin here"
      description="Place one remaining tiffin on this day"
      pending={pending}
      onClick={() => {
        start(async () => {
          const result = await scheduleMyPooledTiffin(orderPublicId, dateIso);
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
          onChanged();
          toast.success("Skipped tiffin scheduled");
        });
      }}
    />
  );
}

// Swap is the same ActionCard + bottom drawer pattern as reschedule/address.
// Eligibility is global (category_swap_pairs), restricted to this meal size's pairs.
function SwapSection({
  delivery,
  categoryLabels,
  onChanged,
  forDate,
}: {
  delivery: DeliveryCardData;
  categoryLabels: Record<string, string>;
  onChanged: () => void;
  /** Eating day this menu selection applies to. */
  forDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = (key: string) => categoryLabels[key] ?? key;
  const fromOptions = [...new Set(delivery.swapPairs.map((p) => p.fromCategory))];
  const [from, setFrom] = useState<string>(fromOptions[0] ?? "");
  const toOptions = delivery.swapPairs.filter((p) => p.fromCategory === from).map((p) => p.toCategory);
  const [to, setTo] = useState<string>(toOptions[0] ?? "");
  const [picks, setPicks] = useState("1");

  if (delivery.swapPairs.length === 0) return null;

  const daySwaps = delivery.appliedSwaps.filter(
    (s) => (s.forDate ?? delivery.deliveryDate) === forDate,
  );

  function selectFrom(next: string) {
    setFrom(next);
    const firstTo = delivery.swapPairs.find((p) => p.fromCategory === next)?.toCategory;
    if (firstTo) setTo(firstTo);
  }

  const picksNum = Number(picks);
  const validPicks = Number.isInteger(picksNum) && picksNum > 0;
  const applied = daySwaps.length;

  function run(fn: () => Promise<ActionResult>, successMsg: string) {
    startTransition(async () => {
      const result = await fn();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onChanged();
      toast.success(("message" in result && result.message) || successMsg);
    });
  }

  function apply() {
    if (!to || !validPicks) return;
    run(async () => {
      const result = await applyMyDeliverySwap(delivery.publicId, from, to, picksNum, forDate);
      if (!("error" in result)) setOpen(false);
      return result;
    }, "Menu selection applied");
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      direction={DELIVERY_SHEET_DIRECTION}
      trigger={
        <ActionCard
          layout="tile"
          icon={ArrowLeftRightIcon}
          title="Menu selection"
          aria-label="Menu selection"
          description={
            applied > 0
              ? `${applied} change${applied === 1 ? "" : "s"} on this day`
              : "Trade an item"
          }
        />
      }
      title="Menu selection"
      footer={
        <Button
          className={IOS_BUTTON}
          disabled={pending || !to || !validPicks}
          onClick={apply}
        >
          {pending ? "Saving…" : "Apply"}
        </Button>
      }
    >
      <div className="space-y-4 px-4 pb-4">
        <p className="text-muted-foreground text-sm">
          Trade a category on this meal for another eligible one. Changes can be removed below.
        </p>
        {applied > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {daySwaps.map((s) => (
              <span key={s.publicId} className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
                {s.qtyFrom} {label(s.fromCategory)} → {s.qtyTo} {label(s.toCategory)}
                <Button
                  variant="ghost"
                  className="h-11 px-2 text-sm underline"
                  disabled={pending}
                  onClick={() => run(() => removeMyDeliverySwap(delivery.publicId, s.publicId), "Selection removed")}
                >
                  Remove
                </Button>
              </span>
            ))}
          </div>
        )}
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Give up</p>
            <div className="flex gap-2">
              <Input
                className="h-12 w-20 tabular-nums"
                type="number"
                min={1}
                value={picks}
                onChange={(e) => setPicks(e.target.value)}
              />
              <Select value={from} onValueChange={selectFrom}>
                <SelectTrigger className="h-12 min-h-12 flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {fromOptions.map((c) => <SelectItem key={c} value={c}>{label(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Get</p>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger className="h-12 min-h-12 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {toOptions.map((c) => <SelectItem key={c} value={c}>{label(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

// Un-skip (for an existing hold) + Reschedule/Address/Swap, scoped to a pre-cutoff,
// non-make-up SCHEDULED (or SKIPPED, for un-skip) day. Skip-without-a-date is not offered —
// Reschedule both holds the original tiffin and places it on a new day.
function DeliveryDayActions({
  delivery,
  locked,
  today,
  deliveryWeekdays,
  categoryLabels,
  onChanged,
  /** When false, Swap moves onto per-eating-day meal cards (split panel). */
  includeSwap = true,
}: {
  delivery: DeliveryCardData;
  locked: boolean;
  today: string;
  deliveryWeekdays: DayOfWeek[];
  categoryLabels: Record<string, string>;
  onChanged: () => void;
  includeSwap?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<ActionResult>, successMsg: string) {
    startTransition(async () => {
      const result = await fn();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onChanged();
      toast.success(("message" in result && result.message) || successMsg);
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

  const showReschedule =
    (!delivery.isMakeup && delivery.status === "scheduled" && !locked) || isHoldOriginal;
  const showUnskip =
    !locked &&
    !delivery.isMakeup &&
    delivery.status === "skipped" &&
    delivery.pooledAt == null &&
    !delivery.hasMakeupScheduled;
  const showAddress = !locked && delivery.status === "scheduled";
  const showSwap = includeSwap && !locked && delivery.status === "scheduled";

  if (!showReschedule && !showUnskip && !showAddress && !showSwap) return null;

  return (
    <>
      {showUnskip && (
        <ActionCard
          layout="tile"
          icon={Undo2Icon}
          title="Un-skip"
          description="Put this day back"
          pending={pending}
          onClick={() => run(() => unskipMyDelivery(delivery.publicId), "Delivery restored")}
        />
      )}
      {showReschedule && (
        <RescheduleDialog
          deliveryPublicId={delivery.publicId}
          today={today}
          sourceDateIso={isHoldOriginal ? delivery.deliveryDate : undefined}
          deliveryWeekdays={deliveryWeekdays}
          onSaved={onChanged}
        />
      )}
      {showAddress && (
        <ChangeAddressDialog
          deliveryPublicId={delivery.publicId}
          address={delivery.address}
          onSaved={onChanged}
        />
      )}
      {showAddress && delivery.hasAddressOverride && (
        <ActionCard
          layout="tile"
          icon={HomeIcon}
          title="Default"
          aria-label="Use default address"
          description="Use your saved address"
          pending={pending}
          onClick={() => run(() => clearMyDeliveryAddress(delivery.publicId), "Address reset to default")}
        />
      )}
      {showSwap && (
        <SwapSection
          delivery={delivery}
          categoryLabels={categoryLabels}
          onChanged={onChanged}
          forDate={delivery.deliveryDate}
        />
      )}
      {!showUnskip && delivery.status === "skipped" && (delivery.pooledAt != null || delivery.hasMakeupScheduled) && (
        <p className="text-muted-foreground col-span-2 px-1 text-xs">
          {delivery.hasMakeupScheduled
            ? "This skip was rescheduled — un-skip is not available."
            : "This skip is in your remain pool — schedule it on a delivery day."}
        </p>
      )}
    </>
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
  planActions,
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
  planActions?: ReactNode;
}) {
  const kind: "cell" | "unreleased" | "off" = cell ? "cell" : delivery ? "unreleased" : "off";
  const status: DayStatus = cell ? calendarDayStatus(cell) : "off";
  const chips = delivery ? mealChips(delivery.meal) : [];
  const released = kind === "cell" && !!cell?.menuWeekId && (cell?.options.length ?? 0) > 0;
  const menuNotReleased = kind === "cell" && status !== "locked" && !released;
  const showSummary = variant === "full";
  const deliveryWeekdays = (tiffinCounts?.deliveryWeekdays ?? []) as DayOfWeek[];

  // Eating-day cards from the month read model; fall back to the trip date alone.
  const eatingDays = delivery?.eatingDays?.length
    ? delivery.eatingDays
    : delivery
      ? [{
          eatingDate: delivery.deliveryDate,
          weekday: weekdayKey(new Date(`${delivery.deliveryDate}T00:00:00Z`)) as DayOfWeek,
          menuWeekReleased: released,
          menuWeekId: cell?.menuWeekId ?? null,
          picks: cell?.meal ?? null,
          options: cell?.options ?? [],
          appliedSwaps: (delivery.appliedSwaps ?? []).map((s) => ({
            ...s,
            forDate: s.forDate ?? null,
          })),
        }]
      : [];
  const multiMeal = eatingDays.length > 1;

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
            {kind !== "unreleased" && (
              <span className="text-muted-foreground text-xs">
                {calendarLegendLabel(status) ?? "Not scheduled"}
                {multiMeal ? ` · ${eatingDays.length} days` : ""}
              </span>
            )}
          </div>
          {kind === "cell" && cell?.combinedInto && (
            <p className="mt-1 text-muted-foreground text-xs">
              Combined into {fullDayName(cell.combinedInto)}&apos;s delivery
            </p>
          )}
          {kind === "cell" && cell && !cell.combinedInto && (cell.units ?? 0) > 1 && (
            <p className="mt-1 text-muted-foreground text-xs">
              {cell.coversLabel ? `${cell.coversLabel} · ` : ""}{cell.units} tiffins
            </p>
          )}
          {kind === "unreleased" && <p className="mt-1 text-muted-foreground text-xs">{menuNotPublishedCopy(dateIso)}</p>}
          {kind === "cell" && menuNotReleased && <p className="mt-1 text-muted-foreground text-xs">{menuNotReleasedCopy(dateIso)}</p>}
          {kind === "cell" && !menuNotReleased && delivery && !multiMeal && (
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

      {(planActions || (kind === "cell" && delivery)) && (
        <div className="space-y-2">
          {multiMeal && (
            <p className="text-muted-foreground px-1 text-xs font-medium uppercase tracking-wide">Delivery</p>
          )}
          <ActionGrid>
            {planActions}
            {kind === "cell" && delivery && (
              <DeliveryDayActions
                delivery={delivery}
                locked={status === "locked"}
                today={today}
                deliveryWeekdays={deliveryWeekdays}
                categoryLabels={categoryLabels}
                onChanged={onChanged}
                includeSwap={false}
              />
            )}
          </ActionGrid>
        </div>
      )}

      {status === "locked" ? (
        delivery ? (
          <CutoffBanner
            days={[{ dateIso, dayOfWeek: weekdayKey(new Date(`${dateIso}T00:00:00Z`)), lockMs: delivery.cutoffAt }]}
            lockedLabel="This day's meal is locked."
          />
        ) : null
      ) : delivery && kind === "cell" ? (
        <div className="space-y-3">
          {multiMeal && (
            <p className="text-muted-foreground px-1 text-xs font-medium uppercase tracking-wide">
              Meals in this delivery
            </p>
          )}
          {eatingDays.map((eat) => {
            const eatCell: CalendarCell = {
              date: eat.eatingDate,
              status: delivery.status as CalendarCell["status"],
              locked: delivery.cutoffAt <= Date.now(),
              isMakeup: delivery.isMakeup,
              menuWeekId: eat.menuWeekId,
              meal: eat.picks,
              options: eat.options,
              coverCount: 1,
            };
            const eatReleased = eat.menuWeekReleased && eat.options.length > 0;
            const daySwaps = eat.appliedSwaps;
            const eatCounts =
              Object.keys(categoryCounts).length > 0
                ? applySwapsToCounts(categoryCounts, daySwaps)
                : categoryCounts;
            const cardChrome = multiMeal;

            return (
              <div
                key={eat.eatingDate}
                className={cn(cardChrome && "space-y-2 rounded-xl border bg-card p-3")}
              >
                {cardChrome && (
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">
                      {formatDateOnly(eat.eatingDate, { mode: "weekday" })}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      Locks {formatEpoch(delivery.cutoffAt, { mode: "datetime", timeZone: tz })} with this delivery
                    </p>
                  </div>
                )}
                {!eat.menuWeekReleased ? (
                  <p className="text-muted-foreground text-xs">Menu not released yet</p>
                ) : !eatReleased ? (
                  <p className="text-muted-foreground text-xs">{menuNotReleasedCopy(eat.eatingDate)}</p>
                ) : (
                  <MealDayPicker
                    cell={eatCell}
                    orderPublicId={orderPublicId}
                    categoryLabels={categoryLabels}
                    categoryCounts={eatCounts}
                    onChanged={onChanged}
                  />
                )}
                {delivery.status === "scheduled" && delivery.cutoffAt > Date.now() && (
                  <ActionGrid>
                    <SwapSection
                      delivery={{
                        ...delivery,
                        appliedSwaps: daySwaps.map((s) => ({
                          publicId: s.publicId,
                          fromCategory: s.fromCategory,
                          toCategory: s.toCategory,
                          qtyFrom: s.qtyFrom,
                          qtyTo: s.qtyTo,
                          forDate: s.forDate,
                        })),
                      }}
                      categoryLabels={categoryLabels}
                      onChanged={onChanged}
                      forDate={eat.eatingDate}
                    />
                  </ActionGrid>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

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
