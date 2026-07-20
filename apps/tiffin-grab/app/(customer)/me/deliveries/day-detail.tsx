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
import { PencilIcon } from "lucide-react";
import { weekdayKey } from "@realm/commons";
import { cn } from "@realm/ui/cn";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { ResponsiveDialog } from "@/components/ds";
import { formatDateOnly, formatEpoch } from "@/lib/format/datetime";
import { CutoffBanner } from "@/components/customer/meals/cutoff-banner";
import type { CalendarCell } from "./calendar-constants";
import { DAY_STATUS_BAR_CLASS, DAY_STATUS_LABEL, calendarDayStatus, type DayStatus } from "./day-status";
import { menuNotPublishedCopy, menuNotReleasedCopy } from "./day-summary-message";
import { mealChips } from "./meal-chips";
import { MealDayPicker } from "./meal-day-picker";
import type { CustomerDelivery } from "@/lib/services/customer-deliveries.service";
import type { DeliveryCardMeal } from "./meal-chips";
import { clearMyDeliveryAddress, setMyDeliveryAddress, skipMyDelivery, unskipMyDelivery } from "./actions";

type Address = { fullName: string; addressLine: string; city: string; postalCode: string };
type DeliveryCardData = CustomerDelivery & { meal: DeliveryCardMeal; address: Address; hasAddressOverride: boolean };

function ChangeAddressDialog({ deliveryPublicId, address, onSaved }: {
  deliveryPublicId: string;
  address: Address;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [fullName, setFullName] = useState(address.fullName);
  const [addressLine, setAddressLine] = useState(address.addressLine);
  const [city, setCity] = useState(address.city);
  const [postalCode, setPostalCode] = useState(address.postalCode);

  function save() {
    start(async () => {
      try {
        await setMyDeliveryAddress(deliveryPublicId, { fullName, addressLine, city, postalCode });
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
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline" size="sm">
          <PencilIcon data-icon="inline-start" /> Change address
        </Button>
      }
      title="Change delivery address"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending} onClick={save}>Save</Button>
        </div>
      }
    >
      <div className="space-y-3 px-4 pb-4 sm:px-0 sm:pb-0">
        <Input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input placeholder="Address line" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />
        <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <Input placeholder="Postal code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
      </div>
    </ResponsiveDialog>
  );
}

// Skip/Un-skip toggle + Change-address, scoped to a pre-cutoff, non-make-up SCHEDULED (or
// SKIPPED, for un-skip) day. Recovered from the pre-redesign delivery-calendar.tsx's
// DeliveryCard actions row — this is the same server-action wiring, just relocated into the
// per-day drawer/panel instead of a per-delivery list card.
function DeliveryDayActions({ delivery, locked, onChanged }: {
  delivery: DeliveryCardData;
  locked: boolean;
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

  if (locked) return null;

  const showSkip = !delivery.isMakeup && delivery.status === "scheduled";
  const showUnskip = !delivery.isMakeup && delivery.status === "skipped";
  const showAddress = delivery.status === "scheduled";

  if (!showSkip && !showUnskip && !showAddress) return null;

  return (
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
    </div>
  );
}

export function DayDetail({
  dateIso, cell, delivery, orderPublicId, categoryLabels, categoryCounts = {}, tz, onChanged,
  // "picker" hides the status summary banner — mobile already shows MobileDayOrderCard above.
  variant = "full",
}: {
  dateIso: string;
  cell: CalendarCell | undefined;
  delivery: DeliveryCardData | undefined;
  orderPublicId: string;
  categoryLabels: Record<string, string>;
  /** Plan composition qty per category — drives how many picks the day picker shows. */
  categoryCounts?: Record<string, number>;
  tz: string;
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
        delivery ? <CutoffBanner days={[{ dateIso, dayOfWeek: weekdayKey(new Date(`${dateIso}T00:00:00Z`)), lockMs: delivery.cutoffAt }]} /> : null
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
        <DeliveryDayActions delivery={delivery} locked={status === "locked"} onChanged={onChanged} />
      )}
    </div>
  );
}
